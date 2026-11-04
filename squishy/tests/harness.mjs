// Test rig for the soft-body solver: places virtual fingertips on the surface the
// way the app does (a ray from a camera, the hit point on the deformed surface, a
// drag plane facing the camera) and records stability metrics every frame.

import { buildSimMesh } from '../src/physics/mesher.js';
import { SoftBody } from '../src/physics/softbody.js';
import { raycastTriangles } from '../src/physics/geom.js';

const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale3 = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const norm3 = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const meshCache = new Map();
export function getMesh(tier) {
  if (!meshCache.has(tier)) meshCache.set(tier, buildSimMesh(tier, 7));
  return meshCache.get(tier);
}

export class Rig {
  constructor({ tier = 'medium', params = {}, substeps } = {}) {
    this.mesh = getMesh(tier);
    const sub = substeps || { low: 12, medium: 16, high: 18 }[tier];
    this.sb = new SoftBody(this.mesh, params, { substeps: sub });
    this.cam = [0, 5.2, 11.2]; // the app's home camera
    this.fingers = new Map();
    this.t = 0;
    this.log = [];
    this.lastInput = 0;
    this.events = [];
    // rest normals of surface faces for fold detection
    const F = this.mesh.surfFaces, X = this.mesh.restPos;
    this.faceN0 = new Float64Array(F.length);
    for (let f = 0; f < F.length; f += 3) {
      const n = this._faceNormal(X, F[f], F[f + 1], F[f + 2]);
      this.faceN0.set(n, f);
    }
  }

  _faceNormal(P, a, b, c) {
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    return norm3([e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]);
  }

  // settle under gravity before the scenario starts
  settle(seconds = 1.5) {
    this.run(seconds, false);
    this.baseShapeErr = this.sb.diagnostics().meanShapeErr;
    this.log.length = 0;
    this.t = 0;
  }

  nearestSurface(target) {
    const S = this.mesh.surfIds, X = this.mesh.restPos;
    let best = -1, bd = Infinity;
    for (const i of S) {
      const d = (X[i * 3] - target[0]) ** 2 + (X[i * 3 + 1] - target[1]) ** 2 + (X[i * 3 + 2] - target[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // Touch the surface near a rest-space target with a ray from the home camera,
  // exactly as a pointer would. Falls back to a camera above the spot's normal
  // when the spot is hidden from the home view.
  down(id, target, pressure = 1) {
    const sb = this.sb;
    const i = this.nearestSurface(target);
    const p = [sb.x[i * 3], sb.x[i * 3 + 1], sb.x[i * 3 + 2]];
    let eye = this.cam;
    let d = norm3(sub3(p, eye));
    let hit = raycastTriangles(sb.x, this.mesh.surfFaces, eye[0], eye[1], eye[2], d[0], d[1], d[2]);
    if (!hit || Math.hypot(...sub3(hit.point, p)) > 0.15) {
      const R = sb.R, n0 = [this.mesh.restN[i * 3], this.mesh.restN[i * 3 + 1], this.mesh.restN[i * 3 + 2]];
      const nrm = [R[0] * n0[0] + R[1] * n0[1] + R[2] * n0[2], R[3] * n0[0] + R[4] * n0[1] + R[5] * n0[2], R[6] * n0[0] + R[7] * n0[1] + R[8] * n0[2]];
      eye = add3(p, scale3(norm3(add3(nrm, scale3(norm3(sub3(this.cam, p)), 0.5))), 10));
      d = norm3(sub3(p, eye));
      hit = raycastTriangles(sb.x, this.mesh.surfFaces, eye[0], eye[1], eye[2], d[0], d[1], d[2]);
    }
    if (!hit) throw new Error(`no surface hit near ${target}`);
    const N = hit.normal;
    const press = norm3(add3(scale3(N, -0.65), scale3(d, 0.35)));
    sb.fingerDown(id, { anchor: hit.point, normal: press, planeN: scale3(d, -1), ray: [eye, d], pressure });
    this.fingers.set(id, { eye, anchor: hit.point });
    this.lastInput = this.t;
  }

  // Move the pointer so the drag target is anchor + offset (world units).
  drag(id, offset, pressure) {
    const f = this.fingers.get(id);
    const target = add3(f.anchor, offset);
    const d = norm3(sub3(target, f.eye));
    this.sb.fingerMove(id, { ray: [f.eye, d], pressure });
    this.lastInput = this.t;
  }

  up(id) {
    const info = this.sb.fingerUp(id);
    this.fingers.delete(id);
    this.lastInput = this.t;
    return info;
  }

  run(seconds, record = true, every = null) {
    const frames = Math.round(seconds * 60);
    for (let k = 0; k < frames; k++) {
      if (every) every(this.t);
      this.sb.step(1 / 60);
      this.t += 1 / 60;
      for (const e of this.sb.events) this.events.push({ ...e, t: this.t });
      this.sb.events.length = 0;
      for (const id of [...this.fingers.keys()]) if (!this.sb.fingers.has(id)) this.fingers.delete(id);
      if (record) this.record();
    }
  }

  record() {
    const sb = this.sb;
    const d = sb.diagnostics();
    let vmax = 0;
    for (let i = 0; i < sb.N; i++) vmax = Math.max(vmax, Math.hypot(sb.v[i * 3], sb.v[i * 3 + 1], sb.v[i * 3 + 2]));
    // folded skin: surface faces whose normal turned against the body's rotated rest normal
    const F = this.mesh.surfFaces, R = sb.R;
    let folded = 0;
    for (let f = 0; f < F.length; f += 3) {
      const n = this._faceNormal(sb.x, F[f], F[f + 1], F[f + 2]);
      const m = this.faceN0;
      const rx = R[0] * m[f] + R[1] * m[f + 1] + R[2] * m[f + 2];
      const ry = R[3] * m[f] + R[4] * m[f + 1] + R[5] * m[f + 2];
      const rz = R[6] * m[f] + R[7] * m[f + 1] + R[8] * m[f + 2];
      if (n[0] * rx + n[1] * ry + n[2] * rz < -0.2) folded++;
    }
    let depth = 0, stretch = 0;
    for (const fi of sb.fingerInfo()) {
      depth = Math.max(depth, fi.depth);
      stretch = Math.max(stretch, fi.stretch);
    }
    this.log.push({ t: this.t, ...d, vmax, folded, fingers: sb.fingers.size, depth, stretch });
  }

  summary() {
    const L = this.log;
    const after = L.filter((r) => r.t > this.lastInput + 0.05);
    const ke = (a, b) => Math.max(0, ...L.filter((r) => r.t >= this.lastInput + a && r.t < this.lastInput + b).map((r) => r.ke));
    const end = L[L.length - 1];
    return {
      nan: Math.max(...L.map((r) => r.nan)),
      inverted: Math.max(...L.map((r) => r.inverted)),
      minJ: Math.min(...L.map((r) => r.minJ)),
      maxJ: Math.max(...L.map((r) => r.maxJ)),
      minStretch: Math.min(...L.map((r) => r.minStretch)),
      maxStretch: Math.max(...L.map((r) => r.maxStretch)),
      volMin: Math.min(...L.map((r) => r.volumeRatio)),
      volMax: Math.max(...L.map((r) => r.volumeRatio)),
      vmax: Math.max(...L.map((r) => r.vmax)),
      folded: Math.max(...L.map((r) => r.folded)),
      maxDepth: Math.max(...L.map((r) => r.depth)),
      maxPull: Math.max(...L.map((r) => r.stretch)),
      keEarly: ke(0.25, 1.25),
      keLate: ke(1.75, 3.0),
      keEnd: end.ke,
      shapeErrEnd: end.meanShapeErr,
      shapeRecover: end.meanShapeErr - (this.baseShapeErr || 0),
      shapePeak: Math.max(...L.map((r) => r.meanShapeErr)) - (this.baseShapeErr || 0),
      settledFor: after.length ? (end.t - this.lastInput) : 0,
      events: this.events.map((e) => e.type),
    };
  }
}
