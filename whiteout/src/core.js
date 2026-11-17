// Shared, DOM-free game logic: collision, movement, vaulting, hitboxes, interpolation.
// Runs in the browser and in Node (tests), so it must not import three.js.
import { MAT } from './map.js';

export const GRAV = 20, STEP = 0.45, R = 0.32, H_STAND = 1.8, H_CROUCH = 1.2, EYE_STAND = 1.64, EYE_CROUCH = 1.06;
export const F = { CROUCH: 1, ADS: 2, SPRINT: 4, AIR: 8, DEAD: 16, RELOAD: 32, VAULT: 64 };
const EPS = 1e-4;
const GROUND = { mat: MAT.SNOW, min: [-1e9, -1, -1e9], max: [1e9, 0, 1e9] };

export class World {
  constructor(boxes) { this.boxes = boxes; }
  overlap(x0, y0, z0, x1, y1, z1) {
    for (const b of this.boxes) {
      if (b.min[0] < x1 && b.max[0] > x0 && b.min[1] < y1 && b.max[1] > y0 && b.min[2] < z1 && b.max[2] > z0) return b;
    }
    return null;
  }
  bodyFree(x, y, z, r, h) { return y > -EPS && !this.overlap(x - r, y + EPS, z - r, x + r, y + h, z + r); }
  // Nearest hit of a ray against boxes and the ground plane, or null. Origins inside a box ignore that box.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT, hit = null, hn = 0, hs = 0;
    if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; hit = GROUND; hn = 1; hs = 1; } }
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (const b of this.boxes) {
      let t0 = 0, t1 = best, ax = -1;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(d[a]) < 1e-12) { if (o[a] < b.min[a] || o[a] > b.max[a]) { t0 = Infinity; break; } continue; }
        let ta = (b.min[a] - o[a]) / d[a], tb = (b.max[a] - o[a]) / d[a];
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) { t0 = ta; ax = a; }
        if (tb < t1) t1 = tb;
        if (t0 > t1) { t0 = Infinity; break; }
      }
      if (ax >= 0 && t0 < best) { best = t0; hit = b; hn = ax; hs = d[ax] > 0 ? -1 : 1; }
    }
    if (!hit) return null;
    const n = [0, 0, 0]; n[hn] = hs;
    return { t: best, box: hit, mat: hit.mat, n, p: [ox + dx * best, oy + dy * best, oz + dz * best] };
  }
  // Highest surface under a footprint that is not above yMax (0 = ground).
  floorAt(x, z, r, yMax) {
    let top = 0;
    for (const b of this.boxes) {
      if (b.max[1] <= yMax + EPS && b.max[1] > top && b.min[0] < x + r && b.max[0] > x - r && b.min[2] < z + r && b.max[2] > z - r) top = b.max[1];
    }
    return top;
  }
}

// Body: {x,y,z, vx,vy,vz, r, h, onGround}. Axis-separated AABB sweep with step-up, sub-stepped at 120 Hz.
export function moveBody(world, b, dt) {
  const n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
  for (let i = 0; i < n; i++) {
    b.vy -= GRAV * h;
    axis(world, b, 0, b.vx * h);
    axis(world, b, 2, b.vz * h);
    b.onGround = false;
    axis(world, b, 1, b.vy * h);
  }
}

function axis(world, b, a, delta) {
  if (!delta) return;
  const p = [b.x, b.y, b.z];
  p[a] += delta;
  for (const bx of world.boxes) {
    if (!(bx.min[0] < p[0] + b.r && bx.max[0] > p[0] - b.r && bx.min[1] < p[1] + b.h && bx.max[1] > p[1] + EPS && bx.min[2] < p[2] + b.r && bx.max[2] > p[2] - b.r)) continue;
    if (a === 1) {
      if (delta < 0) { p[1] = bx.max[1]; b.vy = 0; b.onGround = true; } else { p[1] = bx.min[1] - b.h - EPS; b.vy = 0; }
      continue;
    }
    const rise = bx.max[1] - p[1];
    if (b.grounded && rise > 0 && rise <= STEP && world.bodyFree(p[0], bx.max[1], p[2], b.r, b.h)) { p[1] = bx.max[1]; b.stepped = (b.stepped || 0) + rise; continue; }
    p[a] = delta > 0 ? bx.min[a] - b.r - EPS : bx.max[a] + b.r + EPS;
    if (a === 0) b.vx = 0; else b.vz = 0;
  }
  if (a === 1) {
    if (p[1] < 0) { p[1] = 0; b.vy = 0; b.onGround = true; }
    b.grounded = b.onGround;
  }
  b.x = p[0]; b.y = p[1]; b.z = p[2];
}

// Vault over or mantle onto the obstacle in front. Returns {kind, path:[[x,y,z]...], dur} or null.
export function findVault(world, b, fx, fz) {
  const ax = Math.abs(fx) >= Math.abs(fz) ? 0 : 2, o = 2 - ax, f = ax === 0 ? fx : fz;
  if (Math.abs(f) < 0.55) return null;
  const dir = f > 0 ? 1 : -1, r = b.r, p = [b.x, b.y, b.z];
  const front = p[ax] + dir * r;
  const lo = Math.min(front, front + dir * 0.8), hi = Math.max(front, front + dir * 0.8);
  let near = null;
  for (const bx of world.boxes) {
    if (bx.max[1] <= p[1] + 0.3 || bx.min[1] >= p[1] + 1.9) continue;
    if (bx.min[o] >= p[o] + r || bx.max[o] <= p[o] - r || bx.max[ax] <= lo || bx.min[ax] >= hi) continue;
    const face = dir > 0 ? bx.min[ax] : bx.max[ax];
    if (near === null || (dir > 0 ? face < near : face > near)) near = face;
  }
  if (near === null) return null;
  // Top of the column just past the near face.
  const c0 = Math.min(near, near + dir * 0.3), c1 = Math.max(near, near + dir * 0.3);
  let top = 0, topBox = null;
  for (const bx of world.boxes) {
    if (bx.min[1] >= p[1] + 1.9 || bx.min[o] >= p[o] + r || bx.max[o] <= p[o] - r || bx.max[ax] <= c0 || bx.min[ax] >= c1) continue;
    if (bx.max[1] > top) { top = bx.max[1]; topBox = bx; }
  }
  const h = top - p[1];
  if (h < 0.35 || h > 1.65) return null;
  const at = (c, y, hh) => { const q = [0, y, 0]; q[ax] = c; q[o] = p[o]; return world.bodyFree(q[0], y, q[2], r, hh); };
  const pt = (c, y) => { const q = [0, y, 0]; q[ax] = c; q[o] = p[o]; return q; };
  // Headroom above the player for the climb.
  if (top + H_CROUCH > p[1] + b.h && world.overlap(p[0] - r, p[1] + b.h, p[2] - r, p[0] + r, top + H_CROUCH, p[2] + r)) return null;
  const far = dir > 0 ? topBox.max[ax] : topBox.min[ax];
  const depth = Math.abs(far - near);
  if (h <= 1.3 && depth <= 1.25) {
    const land = far + dir * (r + 0.12);
    const q = pt(land, 0);
    const ly = world.floorAt(q[0], q[2], r, top + 0.05);
    const s0 = Math.min(near, far), s1 = Math.max(near, far);
    const lane = ax === 0
      ? world.overlap(s0 - r, top + EPS, p[2] - r, s1 + r, top + H_CROUCH, p[2] + r)
      : world.overlap(p[0] - r, top + EPS, s0 - r, p[0] + r, top + H_CROUCH, s1 + r);
    if (!lane && at(land, ly, H_STAND)) {
      return { kind: 'vault', dur: 0.42 + 0.12 * h, path: [p.slice(), pt(p[ax] + dir * 0.05, top + 0.12), pt(near + dir * r * 0.6, top + 0.14), pt(far - dir * r * 0.4, top + 0.1), pt(land, ly)] };
    }
  }
  const tgt = near + dir * (r + 0.1);
  if (at(tgt, top, H_CROUCH)) return { kind: 'mantle', dur: 0.38 + 0.22 * h, path: [p.slice(), pt(p[ax], top + 0.06), pt(tgt, top)] };
  return null;
}

// Position along a vault path, eased per segment, t in [0,1].
export function pathAt(path, t) {
  const n = path.length - 1, u = Math.min(n - 1e-9, Math.max(0, t * n)), i = Math.floor(u), k = u - i;
  const e = k * k * (3 - 2 * k), a = path[i], b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e, a[2] + (b[2] - a[2]) * e];
}

// ---- Hitboxes. Local frame: forward is -Z, right is +X. Head is a sphere, the rest are yaw-aligned boxes.
export const ZONE = { HEAD: 0, CHEST: 1, BELLY: 2, ARM: 3, LEG: 4 };
export const ZONE_DMG = [100, 34, 30, 24, 24];
const HB = [
  [[0, 0, 1.63, -0.03, 0.13], [1, 0, 1.33, 0, 0.23, 0.2, 0.14], [2, 0, 1.02, 0, 0.2, 0.13, 0.13], [3, 0.03, 1.3, -0.3, 0.2, 0.1, 0.18],
    [4, -0.11, 0.47, 0, 0.1, 0.47, 0.17], [4, 0.11, 0.47, 0, 0.1, 0.47, 0.17]],
  [[0, 0, 1.17, -0.14, 0.13], [1, 0, 0.93, -0.07, 0.23, 0.19, 0.15], [2, 0, 0.68, 0, 0.2, 0.12, 0.14], [3, 0.03, 0.9, -0.36, 0.2, 0.1, 0.18],
    [4, -0.12, 0.3, -0.05, 0.11, 0.3, 0.26], [4, 0.12, 0.3, -0.05, 0.11, 0.3, 0.26]],
];

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-12) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - r * r, disc = b * b - c;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : (c <= 0 ? 0 : -1);
}

// st = [x, y, z, yaw, pitch, flags]. Direction must be unit length. Returns {t, zone} or null.
export function rayHitbox(ox, oy, oz, dx, dy, dz, maxT, st, inflate = 0, onlyZone = -1) {
  const set = HB[(st[5] & F.CROUCH) ? 1 : 0];
  const c = Math.cos(st[3]), s = Math.sin(st[3]);
  const px = ox - st[0], py = oy - st[1], pz = oz - st[2];
  const lx = c * px - s * pz, lz = s * px + c * pz, ldx = c * dx - s * dz, ldz = s * dx + c * dz;
  let best = maxT, zone = -1;
  for (const h of set) {
    if (onlyZone >= 0 && h[0] !== onlyZone) continue;
    const t = h[0] === 0
      ? raySphere(lx, py, lz, ldx, dy, ldz, h[1], h[2], h[3], h[4] + inflate * 0.6)
      : rayBox(lx, py, lz, ldx, dy, ldz, h[1] - h[4] - inflate, h[2] - h[5] - inflate, h[3] - h[6] - inflate, h[1] + h[4] + inflate, h[2] + h[5] + inflate, h[3] + h[6] + inflate);
    if (t >= 0 && t < best) { best = t; zone = h[0]; }
  }
  return zone < 0 ? null : { t: best, zone };
}

// ---- Interpolation over [{t, s:[x,y,z,yaw,pitch,flags,...]}] sorted by t. Snaps across teleports.
export function angDiff(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }
export function sampleAt(buf, t) {
  const n = buf.length;
  if (!n) return null;
  if (t <= buf[0].t) return buf[0].s;
  let i = n - 1;
  while (i > 0 && buf[i].t > t) i--;
  const a = buf[i], b = buf[i + 1];
  if (!b) {
    const p = buf[i - 1];
    if (!p || t - a.t > 100 || a.t === p.t || far(a.s, p.s)) return a.s;
    return lerpState(p.s, a.s, 1 + (t - a.t) / (a.t - p.t));
  }
  if (far(a.s, b.s)) return b.s;
  return lerpState(a.s, b.s, (t - a.t) / (b.t - a.t));
}
const far = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 3;
function lerpState(a, b, k) {
  const o = a.slice();
  o[0] = a[0] + (b[0] - a[0]) * k; o[1] = a[1] + (b[1] - a[1]) * k; o[2] = a[2] + (b[2] - a[2]) * k;
  o[3] = a[3] + angDiff(a[3], b[3]) * k; o[4] = a[4] + (b[4] - a[4]) * k;
  o[5] = k < 0.5 ? a[5] : b[5];
  return o;
}

export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
export const dirFrom = (yaw, pitch) => [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
export const eyeH = (flags) => (flags & F.CROUCH) ? EYE_CROUCH : EYE_STAND;
