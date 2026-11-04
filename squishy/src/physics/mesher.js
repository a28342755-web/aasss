// Builds the volumetric simulation mesh for the body: a tetrahedral mesh whose
// boundary vertices lie exactly on the rest surface.
//
// 1. Blue-noise surface samples (Poisson disk on a dense surface point cloud) with
//    a spacing that gets finer on the ears and the front, coarser underneath.
// 2. Blue-noise interior samples, kept clear of the surface.
// 3. 3D Delaunay tetrahedralisation (Bowyer–Watson with adjacency walking and a
//    connected, star-shaped cavity, so round-off can never produce overlapping
//    tets).
// 4. Carve away tets outside the (non-convex) body and peel poor boundary tets.
//
// Everything is deterministic for a given seed, so the main thread, the physics
// worker and the tests all agree on the same mesh.

import { CENTER_Y, inside, surfacePoint, earWeight, icosphereDirs, mulberry32, CHEEKS } from './shape.js';
import { PointGrid } from './hash.js';

// Bump when the shape or the mesher changes: cached meshes are keyed by it.
export const MESH_VERSION = 4;

export const TIERS = {
  low: { spacing: 0.25, interior: 1.75, substeps: 8, render: 26, shadow: 1024 },
  medium: { spacing: 0.2, interior: 1.75, substeps: 10, render: 36, shadow: 1536 },
  high: { spacing: 0.165, interior: 1.7, substeps: 12, render: 46, shadow: 2048 },
};

// Local target spacing: finer on ears (for pulling) and on the face/front where
// most touches land; coarser on the base and the back.
function spacingAt(x, y, z, s0) {
  let s = s0;
  const ew = earWeight(x, y, z);
  s *= 1 - 0.52 * ew;
  if (z > 0.2 && y > 0.25) s *= 0.92;
  if (y < 0.3) s *= 1 + 0.25 * (1 - y / 0.3);
  if (z < -0.35) s *= 1.1;
  return s;
}

// ---- small vector helpers on flat arrays -------------------------------------
function orient(P, a, b, c, d) {
  const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
  const bx = P[b * 3] - ax, by = P[b * 3 + 1] - ay, bz = P[b * 3 + 2] - az;
  const cx = P[c * 3] - ax, cy = P[c * 3 + 1] - ay, cz = P[c * 3 + 2] - az;
  const dx = P[d * 3] - ax, dy = P[d * 3 + 1] - ay, dz = P[d * 3 + 2] - az;
  return bx * (cy * dz - cz * dy) - by * (cx * dz - cz * dx) + bz * (cx * dy - cy * dx);
}

// Outward faces of a positively oriented tet (v0, v1, v2, v3): face i is opposite vi.
export const TET_FACES = [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]];

// ---- Delaunay (Bowyer–Watson) -------------------------------------------------
export function delaunay(points, nPts) {
  // bounding box & super tetrahedron
  let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  for (let i = 0; i < nPts; i++) {
    const x = points[i * 3], y = points[i * 3 + 1], z = points[i * 3 + 2];
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  }
  const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, cz = (mnz + mxz) / 2;
  const R = Math.max(mxx - mnx, mxy - mny, mxz - mnz) * 6 + 1;
  const P = new Float64Array((nPts + 4) * 3);
  P.set(points.subarray(0, nPts * 3));
  const s = nPts;
  const sup = [
    [cx + R * 0.0, cy + R * 3.0, cz + R * 0.0],
    [cx - R * 2.83, cy - R * 1.0, cz - R * 1.63],
    [cx + R * 2.83, cy - R * 1.0, cz - R * 1.63],
    [cx + R * 0.0, cy - R * 1.0, cz + R * 3.27],
  ];
  for (let k = 0; k < 4; k++) P.set(sup[k], (s + k) * 3);

  let cap = 1024;
  let TV = new Int32Array(cap * 4); // vertices
  let TN = new Int32Array(cap * 4); // neighbour across face i (opposite vertex i)
  let TC = new Float64Array(cap * 4); // circumsphere cx, cy, cz, r^2
  let alive = new Uint8Array(cap);
  let mark = new Int32Array(cap);
  let nT = 0;
  let stamp = 0;

  const grow = () => {
    cap *= 2;
    const tv = new Int32Array(cap * 4); tv.set(TV); TV = tv;
    const tn = new Int32Array(cap * 4); tn.set(TN); TN = tn;
    const tc = new Float64Array(cap * 4); tc.set(TC); TC = tc;
    const al = new Uint8Array(cap); al.set(alive); alive = al;
    const mk = new Int32Array(cap); mk.set(mark); mark = mk;
  };

  const circum = (t) => {
    const a = TV[t * 4], b = TV[t * 4 + 1], c = TV[t * 4 + 2], d = TV[t * 4 + 3];
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const bx = P[b * 3] - ax, by = P[b * 3 + 1] - ay, bz = P[b * 3 + 2] - az;
    const ccx = P[c * 3] - ax, ccy = P[c * 3 + 1] - ay, ccz = P[c * 3 + 2] - az;
    const dx = P[d * 3] - ax, dy = P[d * 3 + 1] - ay, dz = P[d * 3 + 2] - az;
    const lb = bx * bx + by * by + bz * bz;
    const lc = ccx * ccx + ccy * ccy + ccz * ccz;
    const ld = dx * dx + dy * dy + dz * dz;
    // cross products
    const cdx = ccy * dz - ccz * dy, cdy = ccz * dx - ccx * dz, cdz = ccx * dy - ccy * dx;
    const dbx = dy * bz - dz * by, dby = dz * bx - dx * bz, dbz = dx * by - dy * bx;
    const bcx = by * ccz - bz * ccy, bcy = bz * ccx - bx * ccz, bcz = bx * ccy - by * ccx;
    const den = bx * cdx + by * cdy + bz * cdz;
    const inv = den !== 0 ? 0.5 / den : 0;
    const ox = (lb * cdx + lc * dbx + ld * bcx) * inv;
    const oy = (lb * cdy + lc * dby + ld * bcy) * inv;
    const oz = (lb * cdz + lc * dbz + ld * bcz) * inv;
    TC[t * 4] = ax + ox;
    TC[t * 4 + 1] = ay + oy;
    TC[t * 4 + 2] = az + oz;
    TC[t * 4 + 3] = den !== 0 ? ox * ox + oy * oy + oz * oz : Infinity;
  };

  const addTet = (a, b, c, d) => {
    if (nT >= cap) grow();
    const t = nT++;
    TV[t * 4] = a; TV[t * 4 + 1] = b; TV[t * 4 + 2] = c; TV[t * 4 + 3] = d;
    TN[t * 4] = TN[t * 4 + 1] = TN[t * 4 + 2] = TN[t * 4 + 3] = -1;
    alive[t] = 1;
    mark[t] = 0;
    circum(t);
    return t;
  };

  const inCircum = (t, p) => {
    const dx = P[p * 3] - TC[t * 4], dy = P[p * 3 + 1] - TC[t * 4 + 1], dz = P[p * 3 + 2] - TC[t * 4 + 2];
    return dx * dx + dy * dy + dz * dz < TC[t * 4 + 3] * (1 - 1e-12);
  };

  // p is strictly beyond outward face i of tet t
  const beyond = (t, i, p) => {
    const f = TET_FACES[i];
    return orient(P, TV[t * 4 + f[0]], TV[t * 4 + f[1]], TV[t * 4 + f[2]], p) > 0;
  };

  // start: super tet, make it positively oriented
  if (orient(P, s, s + 1, s + 2, s + 3) > 0) addTet(s, s + 1, s + 2, s + 3);
  else addTet(s, s + 2, s + 1, s + 3);

  let last = 0;
  const cavity = [];
  const bFaces = []; // [a, b, c, outerTet, outerSlot]
  const edgeMap = new Map();

  for (let p = 0; p < nPts; p++) {
    // ---- locate by walking ----
    let t = last;
    if (!alive[t]) {
      for (t = nT - 1; t >= 0 && !alive[t]; t--);
    }
    let steps = 0;
    for (;;) {
      let moved = false;
      const start = (steps * 7) & 3;
      for (let k = 0; k < 4; k++) {
        const i = (start + k) & 3;
        if (beyond(t, i, p)) {
          const nb = TN[t * 4 + i];
          if (nb >= 0) {
            t = nb;
            moved = true;
            break;
          }
        }
      }
      if (!moved) break;
      if (++steps > 20000) {
        // fallback: any tet whose circumsphere contains p
        for (t = nT - 1; t >= 0; t--) if (alive[t] && inCircum(t, p)) break;
        break;
      }
    }
    if (t < 0) continue;

    // ---- grow a connected cavity of tets whose circumsphere contains p ----
    stamp++;
    cavity.length = 0;
    cavity.push(t);
    mark[t] = stamp;
    for (let qi = 0; qi < cavity.length; qi++) {
      const c = cavity[qi];
      for (let i = 0; i < 4; i++) {
        const nb = TN[c * 4 + i];
        if (nb < 0 || mark[nb] === stamp) continue;
        if (inCircum(nb, p)) {
          mark[nb] = stamp;
          cavity.push(nb);
        }
      }
    }

    // ---- make sure every boundary face sees p (star-shaped cavity) ----
    for (let guard = 0; guard < 50; guard++) {
      bFaces.length = 0;
      let bad = -1;
      for (const c of cavity) {
        for (let i = 0; i < 4; i++) {
          const nb = TN[c * 4 + i];
          if (nb >= 0 && mark[nb] === stamp) continue;
          const f = TET_FACES[i];
          const a = TV[c * 4 + f[0]], b = TV[c * 4 + f[1]], cc = TV[c * 4 + f[2]];
          if (orient(P, a, b, cc, p) >= 0) {
            bad = nb;
          }
          let slot = -1;
          if (nb >= 0) for (let j = 0; j < 4; j++) if (TN[nb * 4 + j] === c) slot = j;
          bFaces.push(a, b, cc, nb, slot);
        }
      }
      if (bad < 0) break;
      mark[bad] = stamp;
      cavity.push(bad);
    }

    // ---- retriangulate ----
    for (const c of cavity) alive[c] = 0;
    edgeMap.clear();
    const link = (u, v, tet, slot) => {
      const k = u < v ? u * 65536 + v : v * 65536 + u;
      const other = edgeMap.get(k);
      if (other === undefined) edgeMap.set(k, tet * 4 + slot);
      else {
        const ot = (other / 4) | 0, os = other & 3;
        TN[tet * 4 + slot] = ot;
        TN[ot * 4 + os] = tet;
        edgeMap.delete(k);
      }
    };
    for (let k = 0; k < bFaces.length; k += 5) {
      const a = bFaces[k], b = bFaces[k + 1], c = bFaces[k + 2], nb = bFaces[k + 3], slot = bFaces[k + 4];
      // outward face (a, b, c) == (v0, v2, v1) of the new tet (v0, v1, v2, v3=p)
      const nt = addTet(a, c, b, p);
      TN[nt * 4 + 3] = nb;
      if (nb >= 0 && slot >= 0) TN[nb * 4 + slot] = nt;
      // faces: 0 = (c, b, p) edge c-b; 1 = (a, p, b) edge a-b; 2 = (a, c, p) edge a-c
      link(c, b, nt, 0);
      link(a, b, nt, 1);
      link(a, c, nt, 2);
      last = nt;
    }
  }

  const out = [];
  for (let t = 0; t < nT; t++) {
    if (!alive[t]) continue;
    const a = TV[t * 4], b = TV[t * 4 + 1], c = TV[t * 4 + 2], d = TV[t * 4 + 3];
    if (a >= s || b >= s || c >= s || d >= s) continue;
    out.push(a, b, c, d);
  }
  return Int32Array.from(out);
}

// ---- point sampling -----------------------------------------------------------
function sampleSurface(s0, rnd) {
  const { dirs } = icosphereDirs(44);
  const n = dirs.length / 3;
  const cand = new Float64Array(n * 3);
  const p = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    surfacePoint(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], p);
    cand[i * 3] = p[0]; cand[i * 3 + 1] = p[1]; cand[i * 3 + 2] = p[2];
  }
  // a lighter cloud (~0.05 apart) for clearance queries
  const dense = new PointGrid(0.12);
  {
    const c = icosphereDirs(24).dirs;
    for (let i = 0; i < c.length; i += 3) {
      surfacePoint(c[i], c[i + 1], c[i + 2], p);
      dense.add(p[0], p[1], p[2]);
    }
  }

  // Poisson-disk selection; ear tips and the top go first so they are always sampled.
  const order = Array.from({ length: n }, (_, i) => i);
  const prio = (i) => -earWeight(cand[i * 3], cand[i * 3 + 1], cand[i * 3 + 2]) * 2 - cand[i * 3 + 1] * 0.2 + rnd() * 0.6;
  const keys = order.map(prio);
  order.sort((a, b) => keys[a] - keys[b]);
  const picked = new PointGrid(s0 * 0.5);
  for (const i of order) {
    const x = cand[i * 3], y = cand[i * 3 + 1], z = cand[i * 3 + 2];
    const s = spacingAt(x, y, z, s0);
    if (picked.anyWithin(x, y, z, s * 0.86)) continue;
    picked.add(x, y, z);
  }
  return { surf: picked.pts, dense };
}

function sampleInterior(s0, interiorScale, surf, dense, rnd) {
  const grid = new PointGrid(s0 * 0.5);
  for (let i = 0; i < surf.length; i += 3) grid.add(surf[i], surf[i + 1], surf[i + 2]);
  const step = s0 * 0.33;
  const cand = [];
  for (let x = -1.5; x <= 1.5; x += step) {
    for (let y = 0.02; y <= 2.3; y += step) {
      for (let z = -1.4; z <= 1.4; z += step) {
        const jx = x + (rnd() - 0.5) * step, jy = y + (rnd() - 0.5) * step, jz = z + (rnd() - 0.5) * step;
        if (inside(jx, jy, jz)) cand.push(jx, jy, jz, rnd());
      }
    }
  }
  const n = cand.length / 4;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => cand[a * 4 + 3] - cand[b * 4 + 3]);
  const out = [];
  for (const i of order) {
    const x = cand[i * 4], y = cand[i * 4 + 1], z = cand[i * 4 + 2];
    const s = spacingAt(x, y, z, s0);
    if (grid.anyWithin(x, y, z, s * 0.9)) continue;
    const clear = dense.nearestDist(x, y, z, (s * interiorScale) / 0.9);
    if (clear < s * 0.62) continue;
    const si = Math.min(s * interiorScale, Math.max(s, clear * 0.9));
    if (si > s && grid.anyWithin(x, y, z, si * 0.9)) continue;
    grid.add(x, y, z);
    out.push(x, y, z);
  }
  return out;
}

function tetQuality(P, a, b, c, d) {
  const vol = orient(P, a, b, c, d) / 6;
  let l2 = 0;
  const e = [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]];
  for (const [u, v] of e) {
    const dx = P[u * 3] - P[v * 3], dy = P[u * 3 + 1] - P[v * 3 + 1], dz = P[u * 3 + 2] - P[v * 3 + 2];
    l2 += dx * dx + dy * dy + dz * dz;
  }
  const lrms = Math.sqrt(l2 / 6);
  return (6 * Math.SQRT2 * vol) / (lrms * lrms * lrms); // 1 for a regular tet
}

// Keep the Delaunay tets that are inside the (non-convex) body.
function carve(raw, P, nSurf, dense, s0) {
  const isSurfPt = (i) => i < nSurf;
  const keep = [];
  for (let t = 0; t < raw.length; t += 4) {
    const v = [raw[t], raw[t + 1], raw[t + 2], raw[t + 3]];
    let gx = 0, gy = 0, gz = 0;
    for (const i of v) { gx += P[i * 3]; gy += P[i * 3 + 1]; gz += P[i * 3 + 2]; }
    gx /= 4; gy /= 4; gz /= 4;
    if (!inside(gx, gy, gz)) continue;
    // edges between surface points must not cut through empty space (ear gaps)
    let ok = true;
    for (let a = 0; a < 4 && ok; a++) {
      for (let b = a + 1; b < 4 && ok; b++) {
        const i = v[a], j = v[b];
        if (!isSurfPt(i) || !isSurfPt(j)) continue;
        const mx = (P[i * 3] + P[j * 3]) / 2, my = (P[i * 3 + 1] + P[j * 3 + 1]) / 2, mz = (P[i * 3 + 2] + P[j * 3 + 2]) / 2;
        if (!inside(mx, my, mz)) {
          const s = spacingAt(mx, my, mz, s0);
          if (dense.nearestDist(mx, my, mz, s) > 0.18 * s) ok = false;
        }
      }
    }
    if (!ok) continue;
    // a nearly flat tet with all four corners on the surface lies in the skin
    if (v.every(isSurfPt) && tetQuality(P, v[0], v[1], v[2], v[3]) < 0.02) continue;
    keep.push(v);
  }
  return keep;
}

// ---- the full build -------------------------------------------------------------
export function buildSimMesh(tierName = 'medium', seed = 7) {
  const tier = TIERS[tierName] || TIERS.medium;
  const rnd = mulberry32(seed);
  const s0 = tier.spacing;

  const { surf, dense } = sampleSurface(s0, rnd);
  const nSurf = surf.length / 3;
  let interior = sampleInterior(s0, tier.interior, surf, dense, rnd);
  let P, keep, nAll;
  const isSurfPt = (i) => i < nSurf;

  // Delaunay + carving, repeated while interior points form slivers: such a
  // point is dropped and the cloud re-triangulated (a cheap stand-in for sliver
  // exudation; flat tets are the ones that invert under hard squeezes).
  for (let pass = 0; pass < 6; pass++) {
    const all = new Float64Array(surf.length + interior.length);
    all.set(surf);
    all.set(interior, surf.length);
    nAll = all.length / 3;

    // Tiny jitter breaks the co-spherical ties that make Delaunay ambiguous.
    const jit = new Float64Array(all);
    for (let i = 0; i < jit.length; i++) jit[i] += (rnd() - 0.5) * s0 * 1e-3;
    // Insert in random order (expected O(n log n) behaviour).
    const perm = Array.from({ length: nAll }, (_, i) => i);
    for (let i = nAll - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    const shuffled = new Float64Array(nAll * 3);
    for (let k = 0; k < nAll; k++) shuffled.set(jit.subarray(perm[k] * 3, perm[k] * 3 + 3), k * 3);
    const raw = delaunay(shuffled, nAll);
    for (let i = 0; i < raw.length; i++) raw[i] = perm[raw[i]];
    P = all;
    keep = carve(raw, P, nSurf, dense, s0);

    const drop = new Set();
    for (const v of keep) {
      const q = tetQuality(P, v[0], v[1], v[2], v[3]);
      if (q >= 0.16) continue;
      const inner = v.filter((i) => !isSurfPt(i) && !drop.has(i));
      if (inner.length && !v.some((i) => drop.has(i))) drop.add(inner[0]);
    }
    if (!drop.size) break;
    const next = [];
    for (let k = 0; k < interior.length / 3; k++) {
      if (!drop.has(nSurf + k)) next.push(interior[k * 3], interior[k * 3 + 1], interior[k * 3 + 2]);
    }
    interior = next;
  }

  // ---- peel poor tets on the boundary, and tets that make the skin non-manifold ----
  const faceKey = (a, b, c) => {
    let x = a, y = b, z = c, t;
    if (x > y) { t = x; x = y; y = t; }
    if (y > z) { t = y; y = z; z = t; }
    if (x > y) { t = x; x = y; y = t; }
    return (x * 8192 + y) * 8192 + z;
  };
  const edgeKey = (a, b) => (a < b ? a * 8192 + b : b * 8192 + a);
  for (let pass = 0; pass < 10; pass++) {
    const count = new Map();
    for (const v of keep) {
      for (const f of TET_FACES) {
        const k = faceKey(v[f[0]], v[f[1]], v[f[2]]);
        count.set(k, (count.get(k) || 0) + 1);
      }
    }
    // boundary edges used by more than two boundary faces
    const edgeUse = new Map();
    for (const v of keep) {
      for (const f of TET_FACES) {
        if (count.get(faceKey(v[f[0]], v[f[1]], v[f[2]])) !== 1) continue;
        for (let e = 0; e < 3; e++) {
          const k = edgeKey(v[f[e]], v[f[(e + 1) % 3]]);
          edgeUse.set(k, (edgeUse.get(k) || 0) + 1);
        }
      }
    }
    const badEdges = new Set();
    for (const [k, n] of edgeUse) if (n !== 2) badEdges.add(k);
    const next = [];
    let removed = 0;
    const worstOnBad = new Map();
    for (let ti = 0; ti < keep.length; ti++) {
      const v = keep[ti];
      if (!badEdges.size) break;
      for (let a = 0; a < 4; a++) {
        for (let b = a + 1; b < 4; b++) {
          const k = edgeKey(v[a], v[b]);
          if (!badEdges.has(k)) continue;
          const q = tetQuality(P, v[0], v[1], v[2], v[3]);
          const w = worstOnBad.get(k);
          if (!w || q < w.q) worstOnBad.set(k, { q, ti });
        }
      }
    }
    const drop = new Set([...worstOnBad.values()].map((w) => w.ti));
    for (let ti = 0; ti < keep.length; ti++) {
      const v = keep[ti];
      if (drop.has(ti)) { removed++; continue; }
      let bfaces = 0;
      for (const f of TET_FACES) if (count.get(faceKey(v[f[0]], v[f[1]], v[f[2]])) === 1) bfaces++;
      if (bfaces) {
        const q = tetQuality(P, v[0], v[1], v[2], v[3]);
        if ((bfaces >= 2 && q < 0.12) || q < 0.04) {
          removed++;
          continue;
        }
      }
      next.push(v);
    }
    keep = next;
    if (!removed) break;
  }

  // ---- compact & orient ----
  const remap = new Int32Array(nAll).fill(-1);
  const pos = [];
  let nP = 0;
  const surfFlagList = [];
  for (const v of keep) {
    for (const i of v) {
      if (remap[i] < 0) {
        remap[i] = nP++;
        pos.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
        surfFlagList.push(isSurfPt(i) ? 1 : 0);
      }
    }
  }
  const restPos = new Float64Array(pos);
  const tets = new Int32Array(keep.length * 4);
  keep.forEach((v, t) => {
    let a = remap[v[0]], b = remap[v[1]], c = remap[v[2]], d = remap[v[3]];
    if (orient(restPos, a, b, c, d) < 0) [c, d] = [d, c];
    tets[t * 4] = a; tets[t * 4 + 1] = b; tets[t * 4 + 2] = c; tets[t * 4 + 3] = d;
  });

  return finishMesh(restPos, tets, tierName);
}

// Derived topology: boundary faces, surface particles, edges, rings, masses.
export function finishMesh(restPos, tets, tierName) {
  const nP = restPos.length / 3;
  const nT = tets.length / 4;
  const faceMap = new Map();
  for (let t = 0; t < nT; t++) {
    for (const f of TET_FACES) {
      const a = tets[t * 4 + f[0]], b = tets[t * 4 + f[1]], c = tets[t * 4 + f[2]];
      const s = [a, b, c].sort((x, y) => x - y);
      const k = (s[0] * 4096 + s[1]) * 4096 + s[2];
      const e = faceMap.get(k);
      if (e) e.n++;
      else faceMap.set(k, { n: 1, a, b, c });
    }
  }
  const faces = [];
  for (const e of faceMap.values()) if (e.n === 1) faces.push(e.a, e.b, e.c);
  const surfFaces = Int32Array.from(faces);

  const isSurf = new Uint8Array(nP);
  for (const i of surfFaces) isSurf[i] = 1;
  const surfIds = [];
  for (let i = 0; i < nP; i++) if (isSurf[i]) surfIds.push(i);

  // surface edges & rings
  const edgeSet = new Map();
  const ring = Array.from({ length: nP }, () => new Set());
  for (let f = 0; f < surfFaces.length; f += 3) {
    const v = [surfFaces[f], surfFaces[f + 1], surfFaces[f + 2]];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const key = a < b ? a * 65536 + b : b * 65536 + a;
      edgeSet.set(key, [Math.min(a, b), Math.max(a, b)]);
      ring[a].add(b);
      ring[b].add(a);
    }
  }
  const surfEdges = new Int32Array(edgeSet.size * 2);
  let ei = 0;
  for (const [a, b] of edgeSet.values()) { surfEdges[ei++] = a; surfEdges[ei++] = b; }
  const ringStart = new Int32Array(surfIds.length + 1);
  const ringList = [];
  surfIds.forEach((i, k) => {
    ringStart[k] = ringList.length;
    for (const j of ring[i]) ringList.push(j);
  });
  ringStart[surfIds.length] = ringList.length;

  // all tet edges (particle neighbourhoods)
  const tetEdgeSet = new Set();
  for (let t = 0; t < nT; t++) {
    for (let a = 0; a < 4; a++) {
      for (let b = a + 1; b < 4; b++) {
        const i = tets[t * 4 + a], j = tets[t * 4 + b];
        tetEdgeSet.add(i < j ? i * 65536 + j : j * 65536 + i);
      }
    }
  }

  // rest surface normals of surface particles (area weighted)
  const restN = new Float64Array(nP * 3);
  for (let f = 0; f < surfFaces.length; f += 3) {
    const a = surfFaces[f], b = surfFaces[f + 1], c = surfFaces[f + 2];
    const e1x = restPos[b * 3] - restPos[a * 3], e1y = restPos[b * 3 + 1] - restPos[a * 3 + 1], e1z = restPos[b * 3 + 2] - restPos[a * 3 + 2];
    const e2x = restPos[c * 3] - restPos[a * 3], e2y = restPos[c * 3 + 1] - restPos[a * 3 + 1], e2z = restPos[c * 3 + 2] - restPos[a * 3 + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    for (const i of [a, b, c]) { restN[i * 3] += nx; restN[i * 3 + 1] += ny; restN[i * 3 + 2] += nz; }
  }
  for (let i = 0; i < nP; i++) {
    const l = Math.hypot(restN[i * 3], restN[i * 3 + 1], restN[i * 3 + 2]);
    if (l > 0) { restN[i * 3] /= l; restN[i * 3 + 1] /= l; restN[i * 3 + 2] /= l; }
  }

  // tet volume, total volume
  let volume = 0;
  let minQ = 1, sumQ = 0;
  for (let t = 0; t < nT; t++) {
    const a = tets[t * 4], b = tets[t * 4 + 1], c = tets[t * 4 + 2], d = tets[t * 4 + 3];
    volume += orient(restPos, a, b, c, d) / 6;
    const q = tetQuality(restPos, a, b, c, d);
    minQ = Math.min(minQ, q);
    sumQ += q;
  }
  let surfVolume = 0;
  for (let f = 0; f < surfFaces.length; f += 3) {
    const a = surfFaces[f] * 3, b = surfFaces[f + 1] * 3, c = surfFaces[f + 2] * 3;
    const P = restPos;
    surfVolume += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) -
      P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c]) +
      P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
  }

  // tets close to each cheek (for puffing them up)
  const cheekTets = [];
  for (let t = 0; t < nT; t++) {
    let gx = 0, gy = 0, gz = 0;
    for (let k = 0; k < 4; k++) {
      const i = tets[t * 4 + k];
      gx += restPos[i * 3] / 4; gy += restPos[i * 3 + 1] / 4; gz += restPos[i * 3 + 2] / 4;
    }
    let w = 0;
    for (const c of CHEEKS) {
      const d2 = (gx - c[0]) ** 2 + (gy - c[1]) ** 2 + (gz - c[2]) ** 2;
      w = Math.max(w, Math.exp(-d2 / (0.3 * 0.3)));
    }
    if (w > 0.08) cheekTets.push(t, w);
  }

  return {
    tier: tierName,
    nP,
    nT,
    restPos,
    restN,
    tets,
    surfFaces,
    surfIds: Int32Array.from(surfIds),
    surfEdges,
    ringStart,
    ringList: Int32Array.from(ringList),
    tetEdges: Int32Array.from(tetEdgeSet, (k) => k),
    cheekTets: Float64Array.from(cheekTets),
    volume,
    surfVolume,
    quality: { min: minQ, mean: sumQ / nT },
    floorY: 0,
    centerY: CENTER_Y,
  };
}
