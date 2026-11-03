import * as THREE from 'three';
import { BODY_VERT, BODY_FRAG } from './shaders.js';

// 찹쌀이: an original round rice-cake creature with a sprout on its head.
// The body is a welded icosphere shaped into a mochi. Touches create "deformers"
// (a dent pushed along the surface normal and/or a pull dragged by the finger),
// each driven by its own spring so the dough sinks, stretches and springs back.

export const FLAVORS = [
  { id: 'milk', name: '우유', body: '#fbf6ef', deep: '#efb9a6', rim: '#ffffff', blush: '#ff9fb2', sprout: '#7cc576' },
  { id: 'strawberry', name: '딸기', body: '#ffd0dc', deep: '#ff7f9d', rim: '#fff4f7', blush: '#ff7b98', sprout: '#68b765' },
  { id: 'matcha', name: '말차', body: '#d6e9bf', deep: '#8fbd6c', rim: '#f7ffef', blush: '#ff9fa8', sprout: '#4f9a46' },
  { id: 'mango', name: '망고', body: '#ffe4a0', deep: '#ffad55', rim: '#fffbea', blush: '#ff9a8e', sprout: '#72b35c' },
  { id: 'soda', name: '소다', body: '#cde7ff', deep: '#7db2ff', rim: '#f5fbff', blush: '#ff9fc0', sprout: '#5fbf96' },
  { id: 'taro', name: '타로', body: '#e0d3f7', deep: '#a58ce3', rim: '#fbf7ff', blush: '#ff9ec4', sprout: '#76b56a' },
  { id: 'choco', name: '초코', body: '#cfa88a', deep: '#8a5638', rim: '#f8e9dd', blush: '#ff8f9a', sprout: '#7ab26b' },
];

// Spring settings are [angular frequency, damping ratio].
export const MODES = {
  soft: {
    name: '말랑', desc: '꾹 누르면 천천히 부풀어 올라요',
    dent: [3.4, 1.25], pull: [6.5, 0.8], body: [8, 0.55],
    maxDepth: 0.34, maxPull: 0.62, pinch: 0.35, kick: 0.5,
  },
  bouncy: {
    name: '탱글', desc: '통통 튀고 출렁출렁 흔들려요',
    dent: [15, 0.17], pull: [13, 0.13], body: [12, 0.15],
    maxDepth: 0.27, maxPull: 0.52, pinch: 0.25, kick: 1.15,
  },
  chewy: {
    name: '쫀득', desc: '쭈우욱 늘어났다가 돌아와요',
    dent: [5.5, 0.6], pull: [6.2, 0.32], body: [8.5, 0.3],
    maxDepth: 0.3, maxPull: 1.0, pinch: 0.6, kick: 0.85,
  },
};

const CENTER_Y = 0.72;           // height of the widest ring; the floor is y = 0
const SHAPE = { A: 1.2, top: 1.0, bottom: CENTER_Y, nTop: 2.15, nBottom: 3.0 };
const ARMS = [[-0.86, -0.22, 0.46], [0.86, -0.22, 0.46]].map(norm3);
const RIM = 0.3;                 // how much a dent pushes up a soft ring around itself
const STRIDE = 20;
const MAX_DEFORMERS = 8;

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

function bodyRadius(dx, dy, dz) {
  const h = Math.hypot(dx, dz);
  const up = dy >= 0;
  const B = up ? SHAPE.top : SHAPE.bottom;
  const n = up ? SHAPE.nTop : SHAPE.nBottom;
  let r = Math.pow(Math.pow(h / SHAPE.A, n) + Math.pow(Math.abs(dy) / B, n), -1 / n);
  for (const a of ARMS) {
    const c = clamp(dx * a[0] + dy * a[1] + dz * a[2], -1, 1);
    const ang = Math.acos(c);
    r += 0.085 * Math.exp(-(ang * ang) / (0.18 * 0.18));
  }
  return r;
}

// Icosphere with shared vertices (no UV seam), so every vertex can move freely.
function icosphere(detail) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const src = ico.getAttribute('position').array;
  const total = src.length / 3;
  const map = new Map();
  const verts = [];
  const index = new Uint32Array(total);
  for (let i = 0; i < total; i++) {
    const x = src[i * 3], y = src[i * 3 + 1], z = src[i * 3 + 2];
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      const l = Math.hypot(x, y, z);
      verts.push(x / l, y / l, z / l);
    }
    index[i] = id;
  }
  ico.dispose();
  const count = verts.length / 3;
  return { dirs: new Float32Array(verts), index: count < 65536 ? Uint16Array.from(index) : index };
}

function computeNormals(pos, index, out) {
  out.fill(0);
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    out[a] += nx; out[a + 1] += ny; out[a + 2] += nz;
    out[b] += nx; out[b + 1] += ny; out[b + 2] += nz;
    out[c] += nx; out[c + 1] += ny; out[c + 2] += nz;
  }
  for (let i = 0; i < out.length; i += 3) {
    const l = Math.hypot(out[i], out[i + 1], out[i + 2]) || 1;
    out[i] /= l; out[i + 1] /= l; out[i + 2] /= l;
  }
}

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

const _m4 = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _pa = new THREE.Vector3();
const _pb = new THREE.Vector3();
const _pc = new THREE.Vector3();
const _bary = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

export class Mochi {
  constructor({ detail = 30 } = {}) {
    this.group = new THREE.Group();
    this.mode = MODES.soft;
    this.deformers = [];
    this.events = [];
    this.time = 0;
    this.sy = 1; this.syV = 0;
    this.shx = 0; this.shxV = 0;
    this.shz = 0; this.shzV = 0;
    this.jumpY = 0; this.jumpV = 0; this.jumpPower = 1;
    this.airborne = false; this.crouch = 0;
    this.bulge = 0;
    this.asleep = false;
    this.gaze = { x: 0, y: 0 };
    this.face = { blink: 0, squeeze: 0, happy: 0, sleep: 0, surprise: 0, mouth: 0, blush: 0.3, lx: 0, ly: 0 };
    this.timers = { happy: 0, surprise: 0, pout: 0, blinkWait: 2.2, blinkT: -1 };
    this.params = new Float64Array(STRIDE * MAX_DEFORMERS);
    this._buildBody(detail);
    this._buildSprout();
  }

  _buildBody(detail) {
    const { dirs, index } = icosphere(detail);
    const n = dirs.length / 3;
    const rest = new Float32Array(n * 3);
    let top = 0;
    for (let i = 0; i < n; i++) {
      const dx = dirs[i * 3], dy = dirs[i * 3 + 1], dz = dirs[i * 3 + 2];
      const r = bodyRadius(dx, dy, dz);
      rest[i * 3] = dx * r;
      rest[i * 3 + 1] = Math.max(0, dy * r + CENTER_Y);
      rest[i * 3 + 2] = dz * r;
      if (rest[i * 3 + 1] > rest[top * 3 + 1]) top = i;
    }
    const restN = new Float32Array(n * 3);
    computeNormals(rest, index, restN);

    this.count = n;
    this.index = index;
    this.rest = rest;
    this.restN = restN;
    this.top = top;
    this.cheeks = [-1, 1].map((sx) => this._nearestVertex(sx * 0.5, 0.77, 1.1));
    this.pos = rest.slice();
    this.nrm = restN.slice();
    this.dentAmt = new Float32Array(n);
    this.dirty = false;

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nrmAttr = new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage);
    this.dentAttr = new THREE.BufferAttribute(this.dentAmt, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('normal', this.nrmAttr);
    geo.setAttribute('rest', new THREE.BufferAttribute(rest, 3));
    geo.setAttribute('dent', this.dentAttr);
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 3.4);

    const c = (hex) => new THREE.Color(hex);
    this.uniforms = {
      uBase: { value: c('#fbf6ef') },
      uDeep: { value: c('#efb9a6') },
      uRimCol: { value: c('#ffffff') },
      uInk: { value: c('#3b2a2d') },
      uBlushCol: { value: c('#ff9fb2') },
      uMouthCol: { value: c('#8c3d4b') },
      uTongueCol: { value: c('#ff8c9f') },
      uLightV: { value: new THREE.Vector3(0, 1, 0) },
      uUpV: { value: new THREE.Vector3(0, 1, 0) },
      uSky: { value: new THREE.Color(0.56, 0.54, 0.57) },
      uGround: { value: new THREE.Color(0.45, 0.38, 0.4) },
      uSun: { value: new THREE.Color(0.5, 0.48, 0.46) },
      uLook: { value: new THREE.Vector2() },
      uBlink: { value: 0 },
      uSqueeze: { value: 0 },
      uHappy: { value: 0 },
      uSleep: { value: 0 },
      uSurprise: { value: 0 },
      uMouth: { value: 0 },
      uBlush: { value: 0.3 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.matrixAutoUpdate = false;
    this.group.add(this.mesh);
  }

  _buildSprout() {
    this.sproutMat = new THREE.MeshStandardMaterial({ color: 0x7cc576, roughness: 0.5, side: THREE.DoubleSide });
    const g = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.17, 10, 1), this.sproutMat);
    stem.position.y = 0.07;
    g.add(stem);
    const leafGeo = makeLeafGeometry();
    const leaves = [-1, 1].map((side) => {
      const mount = new THREE.Group();
      mount.position.y = 0.145;
      mount.rotation.y = side < 0 ? Math.PI : 0;
      const hinge = new THREE.Group();
      hinge.add(new THREE.Mesh(leafGeo, this.sproutMat));
      mount.add(hinge);
      g.add(mount);
      return hinge;
    });
    this.sprout = g;
    this.leaves = leaves;
    this.sp = { ax: 0, az: 0, vx: 0, vz: 0, flap: 0, vf: 0, prev: new THREE.Vector3(), vel: new THREE.Vector3(), init: false };
    this.group.add(g);
  }

  _nearestVertex(x, y, z) {
    let best = 0, bd = Infinity;
    const R = this.rest;
    for (let i = 0; i < this.count; i++) {
      const d = (R[i * 3] - x) ** 2 + (R[i * 3 + 1] - y) ** 2 + (R[i * 3 + 2] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  // ---- settings ---------------------------------------------------------
  setFlavor(f) {
    const u = this.uniforms;
    u.uBase.value.set(f.body);
    u.uDeep.value.set(f.deep);
    u.uRimCol.value.set(f.rim);
    u.uBlushCol.value.set(f.blush);
    this.sproutMat.color.set(f.sprout);
  }

  setMode(key) {
    this.mode = MODES[key] || MODES.soft;
  }

  setView(camera, lightDirWorld) {
    const view = camera.matrixWorldInverse;
    this.uniforms.uLightV.value.copy(lightDirWorld).transformDirection(view);
    this.uniforms.uUpV.value.copy(UP).transformDirection(view);
  }

  setGaze(x, y) {
    this.gaze.x = clamp(x, -1, 1);
    this.gaze.y = clamp(y, -1, 1);
  }

  // ---- picking ----------------------------------------------------------
  hitBody(raycaster) {
    this.mesh.updateMatrixWorld();
    const hits = raycaster.intersectObject(this.mesh, false);
    return hits.length ? hits[0] : null;
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

  // ---- touching -----------------------------------------------------------
  _newDeformer(cx, cy, cz, nx, ny, nz, pressure) {
    if (this.deformers.length >= MAX_DEFORMERS) {
      const i = this.deformers.findIndex((d) => !d.held);
      if (i < 0) return null;
      this.deformers.splice(i, 1);
    }
    const d = {
      held: true, hold: 0, auto: 0, pressure,
      cx, cy, cz, nx, ny, nz,
      depth: 0, depthV: 0, depthT: 0,
      Dx: 0, Dy: 0, Dz: 0, Vx: 0, Vy: 0, Vz: 0, Tx: 0, Ty: 0, Tz: 0,
      r: 0.28, rp: 0.34, stretched: false, squeaked: false, dead: false,
    };
    this.deformers.push(d);
    return d;
  }

  grab(hit, pressure = 1) {
    _m4.copy(this.mesh.matrixWorld).invert();
    const lp = _v1.copy(hit.point).applyMatrix4(_m4);
    const { a, b, c } = hit.face;
    _pa.fromArray(this.pos, a * 3);
    _pb.fromArray(this.pos, b * 3);
    _pc.fromArray(this.pos, c * 3);
    let w0 = 1, w1 = 0, w2 = 0;
    if (THREE.Triangle.getBarycoord(lp, _pa, _pb, _pc, _bary)) {
      w0 = clamp(_bary.x, 0, 1); w1 = clamp(_bary.y, 0, 1); w2 = clamp(_bary.z, 0, 1);
      const s = w0 + w1 + w2 || 1;
      w0 /= s; w1 /= s; w2 /= s;
    }
    const R = this.rest, N = this.restN;
    const cx = R[a * 3] * w0 + R[b * 3] * w1 + R[c * 3] * w2;
    const cy = R[a * 3 + 1] * w0 + R[b * 3 + 1] * w1 + R[c * 3 + 1] * w2;
    const cz = R[a * 3 + 2] * w0 + R[b * 3 + 2] * w1 + R[c * 3 + 2] * w2;
    let nx = N[a * 3] * w0 + N[b * 3] * w1 + N[c * 3] * w2;
    let ny = N[a * 3 + 1] * w0 + N[b * 3 + 1] * w1 + N[c * 3 + 1] * w2;
    let nz = N[a * 3 + 2] * w0 + N[b * 3 + 2] * w1 + N[c * 3 + 2] * w2;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;

    const d = this._newDeformer(cx, cy, cz, nx, ny, nz, pressure);
    if (!d) return null;
    // a little whole-body flinch on contact
    this.syV -= 0.9 * (0.25 + Math.max(0, ny)) * this.mode.kick;
    this.shxV -= nx * 0.7;
    this.shzV -= nz * 0.7;
    if (this.asleep) this.wake();
    return d;
  }

  // Keyboard poke: press the top of the head without a pointer.
  pressHead() {
    const vi = this.headSpot ?? (this.headSpot = this._nearestVertex(0, 1.5, 0.65));
    const R = this.rest, N = this.restN, o = vi * 3;
    const d = this._newDeformer(R[o], R[o + 1], R[o + 2], N[o], N[o + 1], N[o + 2], 1);
    if (!d) return null;
    this.syV -= 0.9 * (0.25 + Math.max(0, N[o + 1])) * this.mode.kick;
    if (this.asleep) this.wake();
    return d;
  }

  // Drag a held deformer by a world-space offset from where it was grabbed.
  pull(d, wx, wy, wz) {
    if (!d || !d.held) return 'none';
    const M = this.mode;
    _m3.setFromMatrix4(this.mesh.matrixWorld).invert();
    const v = _v1.set(wx, wy, wz).applyMatrix3(_m3);
    const L = v.length();
    if (L > M.maxPull * 2.7) {
      this.release(d, true);
      return 'slip';
    }
    const k = L > 1e-6 ? (M.maxPull * Math.tanh(L / M.maxPull)) / L : 0;
    d.Tx = v.x * k; d.Ty = v.y * k; d.Tz = v.z * k;
    if (!d.stretched && L > 0.22) {
      d.stretched = true;
      return 'stretch';
    }
    return 'ok';
  }

  release(d, slipped = false) {
    if (!d || !d.held) return null;
    d.held = false;
    const M = this.mode;
    const len = Math.hypot(d.Dx, d.Dy, d.Dz);
    const info = { depth: Math.max(0, d.depth) / M.maxDepth, pull: len / M.maxPull, hold: d.hold, slipped };
    if (len > 0.04) {
      const k = 2.4 * M.kick;
      this.shxV -= d.Dx * k;
      this.shzV -= d.Dz * k;
      this.syV += d.Dy * k;
      if (slipped) {
        d.Vx -= d.Dx * 7; d.Vy -= d.Dy * 7; d.Vz -= d.Dz * 7;
      }
    }
    if (d.depth > 0.04) this.syV += d.depth * 3 * Math.max(0.2, d.ny) * M.kick;
    if (!d.auto) this.timers.happy = info.pull > 0.5 ? 0.7 : 1.1;
    return info;
  }

  hop(power = 1) {
    if (this.airborne || this.crouch > 0) return false;
    this.crouch = 0.11;
    this.jumpPower = power;
    return true;
  }

  sleep() {
    this.asleep = true;
  }

  wake() {
    if (!this.asleep) return;
    this.asleep = false;
    this.timers.surprise = 0.8;
    this.hop(0.65);
    this.events.push({ type: 'wake' });
  }

  // Puffed cheeks: two automatic deformers inflate the cheeks for a moment.
  pout() {
    this.timers.pout = 2.0;
    for (const vi of this.cheeks) {
      const R = this.rest, N = this.restN, o = vi * 3;
      const d = this._newDeformer(R[o], R[o + 1], R[o + 2], N[o], N[o + 1], N[o + 2], 0);
      if (!d) continue;
      d.auto = 1.6;
      d.Tx = N[o] * 0.11; d.Ty = N[o + 1] * 0.11; d.Tz = N[o + 2] * 0.11;
    }
  }

  get held() {
    return this.deformers.some((d) => d.held && !d.auto);
  }

  // ---- physics (fixed step) -----------------------------------------------
  step(dt) {
    const M = this.mode;
    this.time += dt;
    let sq = 0, shx = 0, shz = 0, bulge = 0;

    for (const d of this.deformers) {
      if (d.auto) {
        d.auto -= dt;
        if (d.auto <= 0) { d.auto = 0.0001; if (d.held) this.release(d); }
      }
      let wD, zD, wP, zP;
      if (d.held) {
        d.hold += dt;
        if (!d.auto) {
          const L = Math.hypot(d.Tx, d.Ty, d.Tz);
          const press = M.maxDepth * d.pressure * (0.42 + 0.58 * (1 - Math.exp(-d.hold / 0.35)));
          d.depthT = press * (1 - smooth(0.04, 0.24, L));
        }
        wD = 26; zD = 1; wP = d.auto ? 9 : 30; zP = d.auto ? 0.45 : 1;
      } else {
        d.depthT = 0; d.Tx = 0; d.Ty = 0; d.Tz = 0;
        [wD, zD] = M.dent;
        [wP, zP] = M.pull;
      }
      const aD = wD * wD * (d.depthT - d.depth) - 2 * zD * wD * d.depthV;
      d.depthV += aD * dt;
      d.depth += d.depthV * dt;

      const kP = wP * wP, cP = 2 * zP * wP;
      d.Vx += (kP * (d.Tx - d.Dx) - cP * d.Vx) * dt; d.Dx += d.Vx * dt;
      d.Vy += (kP * (d.Ty - d.Dy) - cP * d.Vy) * dt; d.Dy += d.Vy * dt;
      d.Vz += (kP * (d.Tz - d.Dz) - cP * d.Vz) * dt; d.Dz += d.Vz * dt;

      const dep = Math.max(0, d.depth);
      const len = Math.hypot(d.Dx, d.Dy, d.Dz);
      d.r = 0.28 + 0.16 * Math.min(1, dep / M.maxDepth);
      d.rp = 0.34 + 0.22 * Math.min(1, len / M.maxPull);

      if (!d.auto) {
        sq += Math.max(0, d.ny) * dep * 1.05 - d.Dy * 0.3;
        shx += -d.nx * dep * 0.25 + d.Dx * 0.22;
        shz += -d.nz * dep * 0.25 + d.Dz * 0.22;
      }
      bulge += d.depth * d.r * d.r * 1.1;

      if (!d.held && Math.abs(d.depth) < 1e-4 && Math.abs(d.depthV) < 1e-3 && len < 1e-4 &&
          Math.abs(d.Vx) + Math.abs(d.Vy) + Math.abs(d.Vz) < 1e-3) {
        d.dead = true;
      }
    }
    if (this.deformers.some((d) => d.dead)) this.deformers = this.deformers.filter((d) => !d.dead);
    this.bulge = bulge;

    // hop: crouch, launch, fly, land
    if (this.crouch > 0) {
      this.crouch -= dt;
      sq += 0.24;
      if (this.crouch <= 0) {
        this.crouch = 0;
        this.airborne = true;
        this.jumpV = 4.2 * this.jumpPower;
        this.syV += 3.5 * this.jumpPower;
        this.events.push({ type: 'jump' });
      }
    }
    if (this.airborne) {
      this.jumpV -= 22 * dt;
      this.jumpY += this.jumpV * dt;
      sq -= clamp(this.jumpV * 0.035, -0.06, 0.16);
      if (this.jumpY <= 0 && this.jumpV < 0) {
        const impact = -this.jumpV;
        this.jumpY = 0;
        this.jumpV = 0;
        this.airborne = false;
        this.syV -= impact * 0.7 * (0.5 + 0.5 * M.kick);
        this.events.push({ type: 'land', impact });
      }
    }

    const [wB, zB] = M.body;
    const kB = wB * wB, cB = 2 * zB * wB;
    const syT = 1 - clamp(sq, -0.4, 0.42);
    this.syV += (kB * (syT - this.sy) - cB * this.syV) * dt;
    this.sy = clamp(this.sy + this.syV * dt, 0.5, 1.65);
    const shxT = clamp(shx, -0.35, 0.35), shzT = clamp(shz, -0.35, 0.35);
    this.shxV += (kB * 0.8 * (shxT - this.shx) - cB * this.shxV) * dt;
    this.shx = clamp(this.shx + this.shxV * dt, -0.6, 0.6);
    this.shzV += (kB * 0.8 * (shzT - this.shz) - cB * this.shzV) * dt;
    this.shz = clamp(this.shz + this.shzV * dt, -0.6, 0.6);
  }

  // ---- per frame ------------------------------------------------------------
  update(dt) {
    this._deform();
    this._place();
    this._sprout(dt);
    this._expression(dt);
  }

  _deform() {
    const defs = this.deformers;
    const m = defs.length;
    if (m === 0) {
      if (this.dirty) {
        this.pos.set(this.rest);
        this.nrm.set(this.restN);
        this.dentAmt.fill(0);
        this.posAttr.needsUpdate = true;
        this.nrmAttr.needsUpdate = true;
        this.dentAttr.needsUpdate = true;
        this.dirty = false;
      }
      return;
    }
    const M = this.mode;
    const P = this.params;
    for (let k = 0; k < m; k++) {
      const d = defs[k], o = k * STRIDE;
      const rb = d.r * 1.8;
      const len = Math.hypot(d.Dx, d.Dy, d.Dz);
      P[o] = d.cx; P[o + 1] = d.cy; P[o + 2] = d.cz;
      P[o + 3] = d.nx; P[o + 4] = d.ny; P[o + 5] = d.nz;
      P[o + 6] = d.depth / (1 - RIM);
      P[o + 7] = 1 / (d.r * d.r);
      P[o + 8] = 1 / (rb * rb);
      P[o + 9] = Math.max((rb * 2.6) ** 2, (d.rp * 1.8) ** 2);
      P[o + 10] = d.Dx; P[o + 11] = d.Dy; P[o + 12] = d.Dz;
      P[o + 13] = 1 / (d.rp * d.rp);
      P[o + 14] = len > 1e-5 ? M.pinch * Math.min(1, len / M.maxPull) : 0;
      P[o + 15] = len;
      P[o + 16] = len > 1e-5 ? d.Dx / len : 0;
      P[o + 17] = len > 1e-5 ? d.Dy / len : 0;
      P[o + 18] = len > 1e-5 ? d.Dz / len : 0;
    }

    const R = this.rest, RN = this.restN, pos = this.pos, dent = this.dentAmt;
    const bulge = this.bulge;
    const n = this.count;
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const x = R[j], y = R[j + 1], z = R[j + 2];
      let ux = 0, uy = 0, uz = 0, dn = 0;
      for (let k = 0; k < m; k++) {
        const o = k * STRIDE;
        const dx = x - P[o], dy = y - P[o + 1], dz = z - P[o + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > P[o + 9]) continue;
        const depth = P[o + 6];
        if (depth > 1e-5 || depth < -1e-5) {
          const g = (Math.exp(-d2 * P[o + 7]) - RIM * Math.exp(-d2 * P[o + 8])) * depth;
          ux -= P[o + 3] * g; uy -= P[o + 4] * g; uz -= P[o + 5] * g;
          dn += g;
        }
        if (P[o + 15] > 1e-5) {
          const t = d2 * P[o + 13];
          const w = Math.exp(-t * t);
          ux += P[o + 10] * w; uy += P[o + 11] * w; uz += P[o + 12] * w;
          const pinch = P[o + 14];
          if (pinch > 0) {
            const hx = P[o + 16], hy = P[o + 17], hz = P[o + 18];
            const along = dx * hx + dy * hy + dz * hz;
            const s = pinch * 4 * w * (1 - w);
            ux -= (dx - hx * along) * s;
            uy -= (dy - hy * along) * s;
            uz -= (dz - hz * along) * s;
          }
        }
      }
      if (bulge !== 0) {
        const f = y < 0.35 ? bulge * smooth(0, 0.35, y) : bulge;
        ux += RN[j] * f; uy += RN[j + 1] * f; uz += RN[j + 2] * f;
      }
      pos[j] = x + ux;
      const ny = y + uy;
      pos[j + 1] = ny > 0 ? ny : 0;
      pos[j + 2] = z + uz;
      dent[i] = dn > 0 ? dn : 0;
    }
    computeNormals(pos, this.index, this.nrm);
    this.posAttr.needsUpdate = true;
    this.nrmAttr.needsUpdate = true;
    this.dentAttr.needsUpdate = true;
    this.dirty = true;
  }

  // Whole-body squash, lean and hop as one matrix (bottom stays on the plate).
  _place() {
    const t = this.time;
    const breathe = this.asleep ? 0.022 * Math.sin(t * 1.3) : 0.011 * Math.sin(t * 2.1);
    const sy = this.sy * (1 + breathe);
    const sxz = 1 / Math.sqrt(sy);
    const kx = this.shx + 0.008 * Math.sin(t * 1.3);
    const kz = this.shz + 0.006 * Math.sin(t * 1.7 + 1);
    this.mesh.matrix.set(
      sxz, kx * sy, 0, 0,
      0, sy, 0, this.jumpY,
      0, kz * sy, sxz, 0,
      0, 0, 0, 1,
    );
    this.mesh.matrixWorldNeedsUpdate = true;
    this.spread = sxz;
  }

  _sprout(dt) {
    const s = this.sp;
    const o = this.top * 3;
    const base = _v1.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]).applyMatrix4(this.mesh.matrix);
    _m3.getNormalMatrix(this.mesh.matrix);
    const up = _v2.set(this.nrm[o], this.nrm[o + 1], this.nrm[o + 2]).applyMatrix3(_m3).normalize();
    if (!s.init) { s.prev.copy(base); s.vel.set(0, 0, 0); s.init = true; }
    const idt = 1 / Math.max(dt, 1 / 240);
    const vel = _v3.copy(base).sub(s.prev).multiplyScalar(idt);
    const acc = _v4.copy(vel).sub(s.vel).multiplyScalar(idt).clampLength(0, 70);
    s.prev.copy(base);
    s.vel.copy(vel);

    const w = 15, z = 0.13, k = w * w, c = 2 * z * w, h = Math.min(dt, 1 / 30);
    s.vx += (-k * s.ax - c * s.vx - acc.z * 3.5) * h; s.ax = clamp(s.ax + s.vx * h, -0.9, 0.9);
    s.vz += (-k * s.az - c * s.vz + acc.x * 3.5) * h; s.az = clamp(s.az + s.vz * h, -0.9, 0.9);
    s.vf += (-k * s.flap - c * s.vf - acc.y * 2.2) * h; s.flap = clamp(s.flap + s.vf * h, -0.8, 0.8);

    this.sprout.position.copy(base);
    this.sprout.quaternion.setFromUnitVectors(UP, up).multiply(_q.setFromEuler(_e.set(s.ax, 0, s.az)));
    const rest = 0.5 - 0.42 * this.face.sleep + 0.25 * this.face.happy;
    for (const leaf of this.leaves) leaf.rotation.z = rest + s.flap;
  }

  _expression(dt) {
    const F = this.face, T = this.timers, M = this.mode;
    T.happy = Math.max(0, T.happy - dt);
    T.surprise = Math.max(0, T.surprise - dt);
    T.pout = Math.max(0, T.pout - dt);

    let press = 0, anyHeld = false;
    for (const d of this.deformers) {
      if (!d.held || d.auto) continue;
      anyHeld = true;
      press = Math.max(press, d.depth / M.maxDepth, (Math.hypot(d.Dx, d.Dy, d.Dz) / M.maxPull) * 1.1);
    }
    press = clamp(press, 0, 1);
    const asleep = this.asleep;
    const pouting = T.pout > 0;
    const squeezeT = asleep ? 0 : Math.max(smooth(0.3, 0.75, press), pouting ? 1 : 0);
    const happyT = !asleep && !anyHeld && !pouting && T.happy > 0 ? 1 : 0;
    const surpriseT = T.surprise > 0 ? 1 : 0;
    const mouthT = asleep || pouting ? 0 : Math.max(smooth(0.5, 1, press) * 0.9, surpriseT * 0.75);
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

  // World position of a point on the rest shape (for placing effects).
  worldPoint(x, y, z, target) {
    return target.set(x, y, z).applyMatrix4(this.mesh.matrixWorld);
  }
}
