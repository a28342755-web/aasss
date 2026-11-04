import * as THREE from 'three';
import { icosphereDirs, surfacePoint, inside, earWeight, CENTER_Y } from './physics/shape.js';
import { PointGrid } from './physics/hash.js';
import { raycastTriangles } from './physics/geom.js';
import { patchSkinMaterial, patchDepthMaterial, MAX_FINGERS } from './shaders.js';

// 찹쌀이: an original round rice-cake creature with little ears and a sprout.
// This module is the visible side of the soft body: a fine render mesh driven on
// the GPU by the simulated particles, the face and expressions, and the sprout.

export const FLAVORS = [
  { id: 'milk', name: '우유', body: '#fbf6ef', deep: '#efb9a6', rim: '#ffffff', blush: '#ff9fb2', sprout: '#7cc576' },
  { id: 'strawberry', name: '딸기', body: '#ffd0dc', deep: '#ff7f9d', rim: '#fff4f7', blush: '#ff7b98', sprout: '#68b765' },
  { id: 'matcha', name: '말차', body: '#d6e9bf', deep: '#8fbd6c', rim: '#f7ffef', blush: '#ff9fa8', sprout: '#4f9a46' },
  { id: 'mango', name: '망고', body: '#ffe4a0', deep: '#ffad55', rim: '#fffbea', blush: '#ff9a8e', sprout: '#72b35c' },
  { id: 'soda', name: '소다', body: '#cde7ff', deep: '#7db2ff', rim: '#f5fbff', blush: '#ff9fc0', sprout: '#5fbf96' },
  { id: 'taro', name: '타로', body: '#e0d3f7', deep: '#a58ce3', rim: '#fbf7ff', blush: '#ff9ec4', sprout: '#76b56a' },
  { id: 'choco', name: '초코', body: '#cfa88a', deep: '#8a5638', rim: '#f8e9dd', blush: '#ff8f9a', sprout: '#7ab26b' },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

const K = 8; // particles per render vertex
const TEX_W = 1024; // 256 particles per texture row

// A leaf that is pointed at both ends and curls up toward the tip.
function makeLeafGeometry() {
  const geo = new THREE.SphereGeometry(1, 20, 12);
  const p = geo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const u = (x + 1) / 2;
    const w = Math.pow(Math.sin(Math.PI * u), 0.75) * (1.05 - 0.3 * u);
    p.setXYZ(i, u * 0.21, y * 0.02 * w + 0.07 * u * u, z * 0.072 * w);
  }
  geo.computeVertexNormals();
  return geo;
}

const _m3 = new THREE.Matrix3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Mochi {
  constructor(sim, { detail = 36 } = {}) {
    this.sim = sim;
    this.group = new THREE.Group();
    this.events = [];
    this.time = 0;
    this.asleep = false;
    this.gaze = { x: 0, y: 0 };
    this.face = { blink: 0, squeeze: 0, happy: 0, sleep: 0, surprise: 0, mouth: 0, blush: 0.3, lx: 0, ly: 0 };
    this.timers = { happy: 0, surprise: 0, pout: 0, blinkWait: 2.2, blinkT: -1 };
    this._buildSkin(detail);
    this._buildSprout();
  }

  // ---- render mesh + embedding ------------------------------------------------
  _buildSkin(detail) {
    const { dirs, index } = icosphereDirs(detail);
    const n = dirs.length / 3;
    const rest = new Float32Array(n * 3);
    const p = [0, 0, 0];
    let top = -1;
    for (let i = 0; i < n; i++) {
      surfacePoint(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2], p);
      rest[i * 3] = p[0]; rest[i * 3 + 1] = p[1]; rest[i * 3 + 2] = p[2];
      // the sprout grows from the highest point on the head's centre line,
      // between the ears
      if (Math.abs(p[0]) < 0.06 && Math.abs(p[2]) < 0.2 && (top < 0 || p[1] > rest[top * 3 + 1])) top = i;
    }
    const restN = new Float32Array(n * 3);
    for (let f = 0; f < index.length; f += 3) {
      const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
      const e1x = rest[b] - rest[a], e1y = rest[b + 1] - rest[a + 1], e1z = rest[b + 2] - rest[a + 2];
      const e2x = rest[c] - rest[a], e2y = rest[c + 1] - rest[a + 1], e2z = rest[c + 2] - rest[a + 2];
      const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      for (const o of [a, b, c]) { restN[o] += nx; restN[o + 1] += ny; restN[o + 2] += nz; }
    }
    for (let i = 0; i < n; i++) {
      const l = Math.hypot(restN[i * 3], restN[i * 3 + 1], restN[i * 3 + 2]) || 1;
      restN[i * 3] /= l; restN[i * 3 + 1] /= l; restN[i * 3 + 2] /= l;
    }

    // embedding: 8 nearest particles with smooth weights that vanish at the 9th
    // neighbour's distance, so the blend is continuous across the whole skin
    const S = this.sim;
    const grid = new PointGrid(0.3);
    for (let i = 0; i < S.nP; i++) grid.add(S.restPos[i * 3], S.restPos[i * 3 + 1], S.restPos[i * 3 + 2]);
    const idx0 = new Float32Array(n * 4), idx1 = new Float32Array(n * 4);
    const w0 = new Float32Array(n * 4), w1 = new Float32Array(n * 4);
    const ids = new Float32Array(n * K), ws = new Float32Array(n * K);
    const near = [];
    for (let i = 0; i < n; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1], z = rest[i * 3 + 2];
      let r = 0.3;
      for (;;) {
        near.length = 0;
        grid.forEachNear(x, y, z, r, (id, d2) => { near.push(d2, id); });
        if (near.length >= (K + 1) * 2 || r > 3) break;
        r *= 1.5;
      }
      const order = [];
      for (let k = 0; k < near.length; k += 2) order.push(k);
      order.sort((a, b) => near[a] - near[b]);
      const hR = Math.sqrt(near[order[Math.min(K, order.length - 1)]]) * 1.0001 + 1e-6;
      let sum = 0;
      for (let k = 0; k < K; k++) {
        const o = order[Math.min(k, order.length - 1)];
        const q = 1 - near[o] / (hR * hR);
        const w = k < order.length ? q * q * q : 0;
        ids[i * K + k] = near[o + 1];
        ws[i * K + k] = w;
        sum += w;
      }
      for (let k = 0; k < K; k++) ws[i * K + k] /= sum || 1;
      for (let k = 0; k < 4; k++) {
        idx0[i * 4 + k] = ids[i * K + k]; w0[i * 4 + k] = ws[i * K + k];
        idx1[i * 4 + k] = ids[i * K + 4 + k]; w1[i * 4 + k] = ws[i * K + 4 + k];
      }
    }

    // thickness behind each vertex (for translucency)
    const thick = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const nx = -restN[i * 3], ny = -restN[i * 3 + 1], nz = -restN[i * 3 + 2];
      let t = 0.02;
      while (t < 0.9 && inside(rest[i * 3] + nx * t, rest[i * 3 + 1] + ny * t, rest[i * 3 + 2] + nz * t)) t += 0.03;
      thick[i] = t;
    }

    this.count = n;
    this.index = index;
    this.rest = rest;
    this.restN = restN;
    this.skinIds = ids;
    this.skinWs = ws;
    this.top = top;

    // render triangles bucketed by rest centroid, for precise picking
    this.triGrid = new PointGrid(0.12);
    for (let f = 0; f < index.length; f += 3) {
      const a = index[f] * 3, b = index[f + 1] * 3, c = index[f + 2] * 3;
      this.triGrid.add((rest[a] + rest[b] + rest[c]) / 3, (rest[a + 1] + rest[b + 1] + rest[c + 1]) / 3, (rest[a + 2] + rest[b + 2] + rest[c + 2]) / 3, f / 3);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(rest, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(restN, 3));
    geo.setAttribute('skinIdx0', new THREE.BufferAttribute(idx0, 4));
    geo.setAttribute('skinIdx1', new THREE.BufferAttribute(idx1, 4));
    geo.setAttribute('skinW0', new THREE.BufferAttribute(w0, 4));
    geo.setAttribute('skinW1', new THREE.BufferAttribute(w1, 4));
    geo.setAttribute('thick', new THREE.BufferAttribute(thick, 1));
    geo.setIndex(new THREE.BufferAttribute(n < 65536 ? Uint16Array.from(index) : index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4);

    // particle texture
    const rows = Math.ceil((S.nP * 4) / TEX_W);
    this.texData = new Float32Array(TEX_W * rows * 4);
    this.tex = new THREE.DataTexture(this.texData, TEX_W, rows, THREE.RGBAFormat, THREE.FloatType);
    this.tex.minFilter = THREE.NearestFilter;
    this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    // identity affine maps until the first physics state arrives
    for (let i = 0; i < S.nP; i++) {
      const k = i * 16;
      this.texData[k] = 1; this.texData[k + 5] = 1; this.texData[k + 10] = 1; this.texData[k + 13] = 1;
    }
    this.tex.needsUpdate = true;
    this.affine = this.texData; // CPU view for picking & the sprout

    this.fingerVec = Array.from({ length: MAX_FINGERS }, () => new THREE.Vector4(0, 0, 0, 0));
    const c = (hex) => new THREE.Color(hex);
    this.uniforms = {
      uParticles: { value: this.tex },
      uTexW: { value: TEX_W },
      uFingers: { value: this.fingerVec },
      uDeep: { value: c('#efb9a6') },
      uRimCol: { value: c('#ffffff') },
      uInk: { value: c('#3b2a2d') },
      uBlushCol: { value: c('#ff9fb2') },
      uMouthCol: { value: c('#8c3d4b') },
      uTongueCol: { value: c('#ff8c9f') },
      uLightV: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.97, 0.94) },
      uLook: { value: new THREE.Vector2() },
      uBlink: { value: 0 },
      uSqueeze: { value: 0 },
      uHappy: { value: 0 },
      uSleep: { value: 0 },
      uSurprise: { value: 0 },
      uMouth: { value: 0 },
      uBlush: { value: 0.3 },
      uWrinkle: { value: 1 },
      uWrinkleK: { value: 58 },
      uSurface: { value: 0.5 },
    };
    this.material = new THREE.MeshPhysicalMaterial({
      color: 0xfbf6ef,
      roughness: 0.46,
      metalness: 0,
      sheen: 0.35,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#ffffff'),
      clearcoat: 0.22,
      clearcoatRoughness: 0.38,
      envMapIntensity: 0.6,
    });
    patchSkinMaterial(this.material, this.uniforms);
    this.depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patchDepthMaterial(this.depthMaterial, this.uniforms);

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.customDepthMaterial = this.depthMaterial;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);
  }

  _buildSprout() {
    this.sproutMat = new THREE.MeshStandardMaterial({ color: 0x7cc576, roughness: 0.5, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.17, 10, 1), this.sproutMat);
    stem.position.y = 0.07;
    stem.castShadow = true;
    g.add(stem);
    const leafGeo = makeLeafGeometry();
    this.leaves = [-1, 1].map((side) => {
      const mount = new THREE.Group();
      mount.position.y = 0.145;
      mount.rotation.y = side < 0 ? Math.PI : 0;
      const hinge = new THREE.Group();
      const leaf = new THREE.Mesh(leafGeo, this.sproutMat);
      leaf.castShadow = true;
      hinge.add(leaf);
      mount.add(hinge);
      g.add(mount);
      return hinge;
    });
    this.sprout = g;
    this.sp = { ax: 0, az: 0, vx: 0, vz: 0, flap: 0, vf: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), init: false };
    this.group.add(g);
  }

  // ---- physics state ------------------------------------------------------------
  // affine: Float32Array(N*16) from the solver (already interpolated)
  setState(affine) {
    this.texData.set(affine.subarray(0, this.sim.nP * 16));
    this.tex.needsUpdate = true;
  }

  setFingers(list) {
    for (let k = 0; k < MAX_FINGERS; k++) {
      const f = list[k];
      const v = this.fingerVec[k];
      if (!f || f.fade <= 0) { v.set(0, 0, 0, 0); continue; }
      // the fingertip is a sphere resting on the contact point, pushed in by the
      // press depth (its centre sits one radius outside the pressed surface)
      const rho = f.radius * 1.05;
      v.set(f.xf[0] - f.n[0] * rho, f.xf[1] - f.n[1] * rho, f.xf[2] - f.n[2] * rho, f.depth > 0.004 ? rho * Math.min(1, f.fade * 1.5) : 0);
    }
  }

  // CPU version of the vertex shader for one render vertex.
  skinVertex(vi, out, outN) {
    const A = this.affine, ids = this.skinIds, ws = this.skinWs;
    let r00 = 0, r01 = 0, r02 = 0, r03 = 0, r10 = 0, r11 = 0, r12 = 0, r13 = 0, r20 = 0, r21 = 0, r22 = 0, r23 = 0;
    for (let k = 0; k < K; k++) {
      const w = ws[vi * K + k];
      if (w <= 0) continue;
      const o = ids[vi * K + k] * 16;
      r00 += w * A[o]; r01 += w * A[o + 1]; r02 += w * A[o + 2]; r03 += w * A[o + 3];
      r10 += w * A[o + 4]; r11 += w * A[o + 5]; r12 += w * A[o + 6]; r13 += w * A[o + 7];
      r20 += w * A[o + 8]; r21 += w * A[o + 9]; r22 += w * A[o + 10]; r23 += w * A[o + 11];
    }
    const R = this.rest, o = vi * 3;
    const x = R[o], y = R[o + 1], z = R[o + 2];
    out[0] = r00 * x + r01 * y + r02 * z + r03;
    out[1] = r10 * x + r11 * y + r12 * z + r13;
    out[2] = r20 * x + r21 * y + r22 * z + r23;
    if (outN) {
      // cofactor(F)·n₀ gives the deformed normal direction
      const n0x = this.restN[o], n0y = this.restN[o + 1], n0z = this.restN[o + 2];
      const c00 = r11 * r22 - r12 * r21, c01 = r12 * r20 - r10 * r22, c02 = r10 * r21 - r11 * r20;
      const c10 = r02 * r21 - r01 * r22, c11 = r00 * r22 - r02 * r20, c12 = r01 * r20 - r00 * r21;
      const c20 = r01 * r12 - r02 * r11, c21 = r02 * r10 - r00 * r12, c22 = r00 * r11 - r01 * r10;
      let nx = c00 * n0x + c10 * n0y + c20 * n0z;
      let ny = c01 * n0x + c11 * n0y + c21 * n0z;
      let nz = c02 * n0x + c12 * n0y + c22 * n0z;
      const l = Math.hypot(nx, ny, nz) || 1;
      outN[0] = nx / l; outN[1] = ny / l; outN[2] = nz / l;
    }
    return out;
  }

  // Exact pick on the deformed skin: a coarse hit on the simulation surface, then
  // the render triangles around it are skinned on the CPU and ray-tested.
  raycast(o, d, simPos) {
    const S = this.sim;
    const coarse = raycastTriangles(simPos, S.surfFaces, o[0], o[1], o[2], d[0], d[1], d[2]);
    if (!coarse) return null;
    const F = S.surfFaces, X = S.restPos;
    const a = F[coarse.face * 3] * 3, b = F[coarse.face * 3 + 1] * 3, c = F[coarse.face * 3 + 2] * 3;
    const u = coarse.u, v = coarse.v, w = 1 - u - v;
    const rx = X[a] * w + X[b] * u + X[c] * v;
    const ry = X[a + 1] * w + X[b + 1] * u + X[c + 1] * v;
    const rz = X[a + 2] * w + X[b + 2] * u + X[c + 2] * v;
    const cache = new Map();
    const tris = [];
    this.triGrid.forEachNear(rx, ry, rz, 0.4, (t) => { tris.push(t); });
    const pos = [];
    const local = [];
    const vid = (vi) => {
      let k = cache.get(vi);
      if (k === undefined) {
        k = pos.length / 3;
        cache.set(vi, k);
        const p = this.skinVertex(vi, [0, 0, 0]);
        pos.push(p[0], p[1], p[2]);
      }
      return k;
    };
    for (const t of tris) local.push(vid(this.index[t * 3]), vid(this.index[t * 3 + 1]), vid(this.index[t * 3 + 2]));
    const fine = raycastTriangles(pos, local, o[0], o[1], o[2], d[0], d[1], d[2]);
    const hit = fine && fine.t < coarse.t + 0.3 ? fine : coarse;
    let restPoint = [rx, ry, rz];
    if (hit === fine) {
      const t = tris[fine.face];
      const ia = this.index[t * 3] * 3, ib = this.index[t * 3 + 1] * 3, ic = this.index[t * 3 + 2] * 3;
      const fu = fine.u, fv = fine.v, fw = 1 - fu - fv;
      const R = this.rest;
      restPoint = [R[ia] * fw + R[ib] * fu + R[ic] * fv, R[ia + 1] * fw + R[ib + 1] * fu + R[ic + 1] * fv, R[ia + 2] * fw + R[ib + 2] * fu + R[ic + 2] * fv];
    }
    const part = earWeight(restPoint[0], restPoint[1], restPoint[2]) > 0.5 ? 'ear'
      : restPoint[2] > 0.6 && Math.abs(restPoint[0]) > 0.3 && Math.abs(restPoint[1] - 0.77) < 0.25 ? 'cheek'
        : restPoint[1] > 1.35 ? 'head' : 'body';
    return { point: hit.point, normal: hit.normal, t: hit.t, rest: restPoint, part };
  }

  // ---- settings -----------------------------------------------------------------
  setFlavor(f) {
    const u = this.uniforms;
    this.material.color.set(f.body);
    u.uDeep.value.set(f.deep);
    u.uRimCol.value.set(f.rim);
    u.uBlushCol.value.set(f.blush);
    this.material.sheenColor.set(f.rim);
    this.sproutMat.color.set(f.sprout);
  }

  // Surface response also shows in the skin: a stiffer skin wrinkles in fewer,
  // larger folds (wavelength ∝ (bending/stiffness)^¼).
  setSurface(t) {
    this.uniforms.uSurface.value = t;
    this.uniforms.uWrinkleK.value = 74 - 34 * Math.sqrt(t);
  }

  setView(camera, lightDirWorld) {
    this.uniforms.uLightV.value.copy(lightDirWorld).transformDirection(camera.matrixWorldInverse);
  }

  setGaze(x, y) {
    this.gaze.x = clamp(x, -1, 1);
    this.gaze.y = clamp(y, -1, 1);
  }

  hitSprout(raycaster) {
    this.sprout.updateMatrixWorld(true);
    return raycaster.intersectObject(this.sprout, true).length > 0;
  }

  flickSprout() {
    const s = this.sp;
    s.vx += (Math.random() - 0.5) * 26;
    s.vz += (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 10);
    s.vf += 14;
    this.timers.happy = 0.9;
  }

  sleep() {
    this.asleep = true;
  }

  wake() {
    if (!this.asleep) return false;
    this.asleep = false;
    this.timers.surprise = 0.8;
    return true;
  }

  pout() {
    this.timers.pout = 2.0;
  }

  // World position of a rest-space point (approximate: nearest render vertex).
  worldPoint(x, y, z, target) {
    const vi = this._nearestVertex(x, y, z);
    const p = this.skinVertex(vi, [0, 0, 0]);
    return target.set(p[0], p[1], p[2]);
  }

  _nearestVertex(x, y, z) {
    const key = `${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)}`;
    this._nv = this._nv || new Map();
    let vi = this._nv.get(key);
    if (vi !== undefined) return vi;
    let bd = Infinity;
    const R = this.rest;
    for (let i = 0; i < this.count; i++) {
      const d = (R[i * 3] - x) ** 2 + (R[i * 3 + 1] - y) ** 2 + (R[i * 3 + 2] - z) ** 2;
      if (d < bd) { bd = d; vi = i; }
    }
    this._nv.set(key, vi);
    return vi;
  }

  // ---- per frame ----------------------------------------------------------------
  // press: 0..1 how hard the body is being squeezed right now
  update(dt, press, anyHeld) {
    this.time += dt;
    this._sprout(dt);
    this._expression(dt, press, anyHeld);
  }

  _sprout(dt) {
    const s = this.sp;
    const p = this.skinVertex(this.top, [0, 0, 0], (this._tn = this._tn || [0, 1, 0]));
    const base = _v1.set(p[0], p[1], p[2]);
    const up = _v2.set(this._tn[0], this._tn[1], this._tn[2]).normalize();
    if (!s.init) { s.prev.copy(base); s.vel.set(0, 0, 0); s.init = true; }
    const idt = 1 / Math.max(dt, 1 / 240);
    const vel = _v3.copy(base).sub(s.prev).multiplyScalar(idt);
    const acc = _v4.copy(vel).sub(s.vel).multiplyScalar(idt).clampLength(0, 120);
    s.prev.copy(base);
    s.vel.copy(vel);
    const w = 15, z = 0.13, k = w * w, c = 2 * z * w, h = Math.min(dt, 1 / 30);
    s.vx += (-k * s.ax - c * s.vx - acc.z * 2.2) * h; s.ax = clamp(s.ax + s.vx * h, -0.9, 0.9);
    s.vz += (-k * s.az - c * s.vz + acc.x * 2.2) * h; s.az = clamp(s.az + s.vz * h, -0.9, 0.9);
    s.vf += (-k * s.flap - c * s.vf - acc.y * 1.4) * h; s.flap = clamp(s.flap + s.vf * h, -0.8, 0.8);
    this.sprout.position.copy(base).addScaledVector(up, -0.01);
    this.sprout.quaternion.setFromUnitVectors(UP, up).multiply(_q.setFromEuler(_e.set(s.ax, 0, s.az)));
    const rest = 0.5 - 0.42 * this.face.sleep + 0.25 * this.face.happy;
    for (const leaf of this.leaves) leaf.rotation.z = rest + s.flap;
  }

  _expression(dt, press, anyHeld) {
    const F = this.face, T = this.timers;
    T.happy = Math.max(0, T.happy - dt);
    T.surprise = Math.max(0, T.surprise - dt);
    T.pout = Math.max(0, T.pout - dt);
    press = clamp(press, 0, 1);
    const asleep = this.asleep;
    const pouting = T.pout > 0;
    const squeezeT = asleep ? 0 : Math.max(smooth(0.35, 0.8, press), pouting ? 1 : 0);
    const happyT = !asleep && !anyHeld && !pouting && T.happy > 0 ? 1 : 0;
    const surpriseT = T.surprise > 0 ? 1 : 0;
    const mouthT = asleep || pouting ? 0 : Math.max(smooth(0.55, 1, press) * 0.9, surpriseT * 0.75);
    const blushT = asleep ? 0.18 : clamp(0.3 + 0.75 * smooth(0.1, 0.8, press) + happyT * 0.25 + (pouting ? 0.8 : 0), 0, 1);

    F.squeeze = damp(F.squeeze, squeezeT, 22, dt);
    F.happy = damp(F.happy, happyT, 12, dt);
    F.sleep = damp(F.sleep, asleep ? 1 : 0, asleep ? 2.4 : 12, dt);
    F.surprise = damp(F.surprise, surpriseT, 14, dt);
    F.mouth = damp(F.mouth, mouthT, 16, dt);
    F.blush = damp(F.blush, blushT, 6, dt);

    if (T.blinkT >= 0) {
      T.blinkT += dt;
      F.blink = Math.sin(Math.min(1, T.blinkT / 0.17) * Math.PI);
      if (T.blinkT >= 0.17) { T.blinkT = -1; F.blink = 0; }
    } else {
      T.blinkWait -= dt;
      if (T.blinkWait <= 0 && !asleep && F.squeeze < 0.1 && F.happy < 0.1) {
        T.blinkT = 0;
        T.blinkWait = Math.random() < 0.2 ? 0.28 : 1.8 + Math.random() * 3.6;
      }
    }
    F.lx = damp(F.lx, asleep ? 0 : this.gaze.x, 9, dt);
    F.ly = damp(F.ly, asleep ? 0 : this.gaze.y, 9, dt);

    const u = this.uniforms;
    u.uBlink.value = F.blink;
    u.uSqueeze.value = F.squeeze;
    u.uHappy.value = F.happy * (1 - F.squeeze);
    u.uSleep.value = F.sleep;
    u.uSurprise.value = F.surprise;
    u.uMouth.value = F.mouth;
    u.uBlush.value = F.blush;
    u.uLook.value.set(F.lx * 0.05, F.ly * 0.035);
  }
}

export { CENTER_Y };
