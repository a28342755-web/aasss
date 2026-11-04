// Volumetric soft-body solver for 찹쌀이 (no three.js; runs in a Web Worker,
// on the main thread as a fallback, and in Node for the tests).
//
// Small-step XPBD (Macklin et al. 2016, 2019): every frame is split into n
// substeps with one Gauss–Seidel pass of these constraints each. Every
// constraint is zero at rest, which keeps the scheme unconditionally stable at
// 8–12 substeps (a shifted Neo-Hookean deviatoric constraint is not zero at rest
// and needs about four times more substeps before its shear modes stop blowing up).
//
//   tet edges       XPBD mass-spring network on every tetrahedron edge, with
//                   k_e = 6·E·V_e/L² so the network's Young's modulus is E (an
//                   isotropic central-force network has λ = μ = E/2.5·…, see
//                   setParams). Each edge also carries a Maxwell (standard linear
//                   solid) branch whose rest length creeps toward the current length
//                   with relaxation time τ: a held press slowly deepens and a
//                   released dent rises back slowly (viscoelasticity). Constraint
//                   damping on the edges is Kelvin–Voigt (stiffness-proportional)
//                   damping with coefficient β.
//   tet volumes     signed volume per tet with the extra bulk modulus that sets
//                   Poisson's ratio ν; also resists inversion. Breathing and puffed
//                   cheeks change the tets' rest volume.
//   skin            mass-spring membrane on the surface edges plus a Laplacian
//                   (umbrella-operator) constraint that keeps the surface's
//                   differential coordinates, i.e. a soft bending stiffness.
//   volume          one global pressure constraint for the enclosed volume.
//   shape matching  global shape memory (Müller et al. 2005) toward the best rigid
//                   fit of the rest shape; also gives the body frame (R, cm).
//   fingers         force-controlled fingertips: a dynamic press depth pushed by
//                   the finger force, coupled to a weighted patch of particles;
//                   Coulomb friction / adhesion decide when the contact slides or
//                   slips off.
//   self-collision  surface particles via spatial hashing.
//   plate           ground contact with static/kinetic friction; the plate can be
//                   moved (shaken) kinematically.
//
// Units: 1 length unit = 4 cm, density 650 kg/m³ (foamed silicone), seconds. Parameters
// come in SI (Pa, N, N/m, s) and are converted here.

import { SpatialHash } from './hash.js';
import { raycastTriangles, extractRotation, quatToMat } from './geom.js';

export const UNIT = (() => {
  const L = 0.04;
  const rho = 650; // foamed silicone: lighter than solid silicone, like a squishy toy
  const M = rho * L * L * L;
  return {
    L,
    rho,
    M,
    stress: M / L, // Pa per internal stress unit
    force: M * L, // N per internal force unit
    lineForce: M, // N/m per internal unit
    gravity: 9.81 / L,
  };
})();

export const DEFAULT_PARAMS = {
  E: 9000, // Young's modulus of the elastic branch [Pa]
  nu: 0.45, // Poisson's ratio (compressibility)
  g1: 0.8, // Maxwell branch modulus / elastic modulus
  tau: 0.9, // Maxwell relaxation time [s]
  beta: 0.005, // Kelvin–Voigt (stiffness-proportional) damping [s]
  smFreq: 1.0, // shape-memory natural frequency [Hz]
  skin: 25, // surface membrane modulus [N/m]
  radius: 0.25, // fingertip contact radius [units]
  fingerForce: 2.4, // fingertip force at full pressure [N]
  airDrag: 0.4, // [1/s]
  friction: 1.5, // plate static friction (tacky silicone on glazed ceramic)
};

const MAX_FINGERS = 6;

export class SoftBody {
  constructor(mesh, params = {}, opts = {}) {
    this.mesh = mesh;
    const N = (this.N = mesh.nP);
    const T = (this.nT = mesh.nT);
    this.X = mesh.restPos;
    this.tets = mesh.tets;
    this.x = new Float64Array(N * 3);
    this.p = new Float64Array(N * 3);
    this.v = new Float64Array(N * 3);
    this.fx = new Float64Array(N * 3); // external forces (hop, etc.)
    this.mass = new Float64Array(N);
    this.w = new Float64Array(N);
    this.substeps = opts.substeps || 10;
    this.maxSubsteps = this.substeps;
    this.minSubsteps = Math.min(5, this.substeps);
    this.time = 0;
    this.frame = 0;
    this.subCount = 0;

    // ---- tets ----
    this.V = new Float64Array(T);
    this.invDet = new Float64Array(T);
    this.Dinv = new Float64Array(T * 9);
    this.swell = new Float64Array(T).fill(1);
    const X = this.X;
    for (let t = 0; t < T; t++) {
      const a = this.tets[t * 4] * 3, b = this.tets[t * 4 + 1] * 3, c = this.tets[t * 4 + 2] * 3, d = this.tets[t * 4 + 3] * 3;
      const m00 = X[b] - X[a], m10 = X[b + 1] - X[a + 1], m20 = X[b + 2] - X[a + 2];
      const m01 = X[c] - X[a], m11 = X[c + 1] - X[a + 1], m21 = X[c + 2] - X[a + 2];
      const m02 = X[d] - X[a], m12 = X[d + 1] - X[a + 1], m22 = X[d + 2] - X[a + 2];
      const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
      const id = 1 / det;
      const D = this.Dinv, o = t * 9;
      D[o] = (m11 * m22 - m12 * m21) * id; D[o + 1] = (m02 * m21 - m01 * m22) * id; D[o + 2] = (m01 * m12 - m02 * m11) * id;
      D[o + 3] = (m12 * m20 - m10 * m22) * id; D[o + 4] = (m00 * m22 - m02 * m20) * id; D[o + 5] = (m02 * m10 - m00 * m12) * id;
      D[o + 6] = (m10 * m21 - m11 * m20) * id; D[o + 7] = (m01 * m20 - m00 * m21) * id; D[o + 8] = (m00 * m11 - m01 * m10) * id;
      this.invDet[t] = id;
      this.V[t] = det / 6;
      for (let k = 0; k < 4; k++) this.mass[this.tets[t * 4 + k]] += det / 24; // density 1
    }
    let M = 0;
    for (let i = 0; i < N; i++) {
      this.w[i] = this.mass[i] > 0 ? 1 / this.mass[i] : 0;
      M += this.mass[i];
    }
    this.totalMass = M;

    // ---- shape matching ----
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) {
      cx += X[i * 3] * this.mass[i]; cy += X[i * 3 + 1] * this.mass[i]; cz += X[i * 3 + 2] * this.mass[i];
    }
    this.Xcm = [cx / M, cy / M, cz / M];
    this.Xrel = new Float64Array(N * 3);
    for (let i = 0; i < N; i++) {
      this.Xrel[i * 3] = X[i * 3] - this.Xcm[0];
      this.Xrel[i * 3 + 1] = X[i * 3 + 1] - this.Xcm[1];
      this.Xrel[i * 3 + 2] = X[i * 3 + 2] - this.Xcm[2];
    }
    this.q = [0, 0, 0, 1];
    this.R = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    this.cm = [0, 0, 0];
    this.A = new Float64Array(9);

    // ---- surface: membrane edges, Laplacian rings, volume ----
    const se = mesh.surfEdges;
    this.edgeRest = new Float64Array(se.length / 2);
    for (let e = 0; e < se.length / 2; e++) {
      const a = se[e * 2] * 3, b = se[e * 2 + 1] * 3;
      this.edgeRest[e] = Math.hypot(X[a] - X[b], X[a + 1] - X[b + 1], X[a + 2] - X[b + 2]);
    }
    const S = mesh.surfIds;
    this.nS = S.length;
    this.lap0 = new Float64Array(S.length * 3);
    this.colR = new Float64Array(N); // self-collision radius
    let rMax = 0;
    for (let k = 0; k < S.length; k++) {
      const i = S[k];
      const r0 = mesh.ringStart[k], r1 = mesh.ringStart[k + 1];
      let mx = 0, my = 0, mz = 0, el = 0;
      for (let r = r0; r < r1; r++) {
        const j = mesh.ringList[r];
        mx += X[j * 3]; my += X[j * 3 + 1]; mz += X[j * 3 + 2];
        el += Math.hypot(X[j * 3] - X[i * 3], X[j * 3 + 1] - X[i * 3 + 1], X[j * 3 + 2] - X[i * 3 + 2]);
      }
      const n = r1 - r0 || 1;
      this.lap0[k * 3] = X[i * 3] - mx / n;
      this.lap0[k * 3 + 1] = X[i * 3 + 1] - my / n;
      this.lap0[k * 3 + 2] = X[i * 3 + 2] - mz / n;
      this.colR[i] = 0.36 * (el / n);
      rMax = Math.max(rMax, this.colR[i]);
    }
    this.colRMax = rMax;
    this.hash = new SpatialHash(2 * rMax, N);
    // No particle may get closer to the plate than 40% of its rest height: the
    // material can be squashed hard but never flattened into the plate (a
    // crushed bottom layer would invert its tets on impact). Being monotone in
    // rest height, the pads never reorder particles vertically. The flat base
    // (rest height 0) touches the plate directly and carries the friction.
    this.floorPad = new Float64Array(N);
    for (let i = 0; i < N; i++) this.floorPad[i] = 0.4 * Math.max(0, X[i * 3 + 1]);
    // rest "mean curvature" δ₀·n₀ of every surface particle (umbrella operator)
    this.curv0 = new Float64Array(S.length);
    for (let k = 0; k < S.length; k++) {
      const i = S[k];
      this.curv0[k] = this.lap0[k * 3] * mesh.restN[i * 3] + this.lap0[k * 3 + 1] * mesh.restN[i * 3 + 1] + this.lap0[k * 3 + 2] * mesh.restN[i * 3 + 2];
    }
    this.gradV = new Float64Array(N * 3);
    this.restVolume = this._volume(X);
    this.volTarget = this.restVolume;

    // ---- tet edges: the spring network ----
    // Each edge gets 1/6 of the volume of every tet it belongs to (V_e); the
    // stiffness is set from E in setParams.
    {
      const te = mesh.tetEdges;
      const nE = te.length;
      this.eA = new Int32Array(nE);
      this.eB = new Int32Array(nE);
      this.eVL = new Float64Array(nE); // V_e / L²
      this.eL0 = new Float64Array(nE); // elastic rest length
      this.eLv = new Float64Array(nE); // Maxwell branch rest length (creeps)
      this.eK = new Float64Array(nE); // elastic stiffness
      const index = new Map();
      for (let e = 0; e < nE; e++) {
        const k = te[e];
        this.eA[e] = Math.floor(k / 65536);
        this.eB[e] = k % 65536;
        index.set(k, e);
      }
      for (let t = 0; t < T; t++) {
        for (let a = 0; a < 4; a++) {
          for (let b = a + 1; b < 4; b++) {
            const i = this.tets[t * 4 + a], j = this.tets[t * 4 + b];
            const e = index.get(i < j ? i * 65536 + j : j * 65536 + i);
            this.eVL[e] += this.V[t] / 6;
          }
        }
      }
      for (let e = 0; e < nE; e++) {
        const a = this.eA[e] * 3, b = this.eB[e] * 3;
        const L2 = (X[a] - X[b]) ** 2 + (X[a + 1] - X[b + 1]) ** 2 + (X[a + 2] - X[b + 2]) ** 2;
        this.eVL[e] /= L2;
        this.eL0[e] = Math.sqrt(L2);
        this.eLv[e] = this.eL0[e];
      }
    }

    // ---- outputs ----
    this.Facc = new Float64Array(N * 9);
    this.Vacc = new Float64Array(N);
    for (let t = 0; t < T; t++) for (let k = 0; k < 4; k++) this.Vacc[this.tets[t * 4 + k]] += this.V[t];
    this.dent = new Float64Array(N);
    this.dentBase = new Float64Array(N);
    this.isSurf = new Uint8Array(N);
    for (const i of S) this.isSurf[i] = 1;

    // ---- environment ----
    this.plate = { x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0, px: 0, pz: 0, held: false };
    this.fingers = new Map();
    this.events = [];
    this.contacts = 0;
    this.airFrames = 0;
    this.maxFallV = 0;
    this.hopState = null;
    this.pout = 0;
    this.breath = { amp: 0.008, freq: 0.3, phase: 0 };
    this.asleep = false;
    this.stats = { stepMs: 0, ke: 0, substeps: this.substeps };

    this.setParams({ ...DEFAULT_PARAMS, ...params });
    this.reset(opts.dropHeight || 0);
  }

  _isSurfIdx(i, S) {
    if (!this._surfSet) this._surfSet = new Set(S);
    return this._surfSet.has(i);
  }

  reset(dropHeight = 0) {
    const N = this.N;
    for (let i = 0; i < N * 3; i++) {
      this.x[i] = this.X[i] + (i % 3 === 1 ? dropHeight : 0);
      this.p[i] = this.x[i];
      this.v[i] = 0;
    }
    this.eLv.set(this.eL0);
    this.q = [0, 0, 0, 1];
    this.fingers.clear();
  }

  // ---- parameters -----------------------------------------------------------
  setParams(p) {
    this.params = { ...(this.params || DEFAULT_PARAMS), ...p };
    const P = this.params;
    const E = Math.max(200, P.E) / UNIT.stress;
    const nu = Math.min(0.49, Math.max(0.25, P.nu));
    this.E = E;
    this.g1 = Math.max(0, P.g1);
    // A central-force network with k_e = c·E·V_e/L² and isotropic edge directions
    // has C_ijkl = c·E·<n_i n_j n_k n_l>, i.e. λ = μ = cE/15 and Young's modulus
    // cE/6, so c = 6 gives E. Its Poisson ratio is 1/4 and its bulk modulus 2E/3;
    // the tet volume constraints add what is missing for the requested ν.
    for (let e = 0; e < this.eK.length; e++) this.eK[e] = 6 * E * this.eVL[e];
    const Ktarget = E / (3 * (1 - 2 * nu));
    this.kVol = Math.max(0, Ktarget - (2 / 3) * E);
    this.bulk = Ktarget * (1 + this.g1);
    this.Einst = E * (1 + this.g1);
    this.tau = Math.max(0.05, P.tau);
    this.beta = Math.max(0, P.beta);
    this.smOmega = 2 * Math.PI * Math.max(0, P.smFreq);
    const ys = Math.max(0, P.skin) / UNIT.lineForce;
    this.kEdge = 0.866 * ys;
    this.kLap = 1.6 * ys;
    this.radius = P.radius;
    this.fingerF = P.fingerForce / UNIT.force;
    this.gravity = UNIT.gravity;
    this.air = P.airDrag;
    this.mu = P.friction;
  }

  // Maxwell branch: each edge's viscous rest length creeps toward its current
  // length (spring k1 = g1·k in series with a dashpot η = k1·τ).
  _creep(dt) {
    if (this.g1 <= 0) return;
    const k = 1 - Math.exp(-dt / this.tau);
    const x = this.x, A = this.eA, B = this.eB, L0 = this.eL0, Lv = this.eLv;
    for (let e = 0, nE = A.length; e < nE; e++) {
      const a = A[e] * 3, b = B[e] * 3;
      const L = Math.sqrt((x[a] - x[b]) ** 2 + (x[a + 1] - x[b + 1]) ** 2 + (x[a + 2] - x[b + 2]) ** 2);
      let lv = Lv[e] + (L - Lv[e]) * k;
      const l0 = L0[e];
      if (lv < 0.5 * l0) lv = 0.5 * l0;
      else if (lv > 2 * l0) lv = 2 * l0;
      Lv[e] = lv;
    }
  }

  _volume(x) {
    const F = this.mesh.surfFaces;
    let V = 0;
    for (let f = 0; f < F.length; f += 3) {
      const a = F[f] * 3, b = F[f + 1] * 3, c = F[f + 2] * 3;
      V += x[a] * (x[b + 1] * x[c + 2] - x[b + 2] * x[c + 1]) -
        x[a + 1] * (x[b] * x[c + 2] - x[b + 2] * x[c]) +
        x[a + 2] * (x[b] * x[c + 1] - x[b + 1] * x[c]);
    }
    return V / 6;
  }

  // ---- input ------------------------------------------------------------------
  // anchor: contact point on the surface (world). normal: press direction INTO the
  // body. planeN: normal of the drag plane (towards the camera). ray: [o, d].
  fingerDown(id, { anchor, normal, planeN, ray, pressure = 1, radius }) {
    if (this.fingers.size >= MAX_FINGERS && !this.fingers.has(id)) return false;
    const f = {
      id,
      state: 'down',
      hold: 0,
      rel: 0,
      pressure,
      F: 0,
      A: anchor.slice(),
      n: normal.slice(),
      pn: planeN.slice(),
      T0: anchor.slice(),
      T1: anchor.slice(),
      T: anchor.slice(),
      s: 0,
      vs: 0,
      ray: ray ? [ray[0].slice(), ray[1].slice()] : null,
      radius: radius || this.radius,
      idx: null, off: null, k: null, lam: null,
      fsum: [0, 0, 0], fn: 0, ft: 0, fEMA: 0, ftEMA: 0, fnEMA: 0,
      slideCool: 0,
      slides: 0,
      xf: anchor.slice(),
      maxDepth: 0,
    };
    // Thin parts (ears) get pinched rather than pressed: the press force scales
    // with the material thickness behind the contact.
    f.pressScale = this._pressScale(anchor, f.n);
    this._buildPatch(f, anchor);
    this.fingers.set(id, f);
    if (this.asleep) this.asleep = false;
    return true;
  }

  // Local feature width behind the contact: the shortest of five rays fanned
  // around the press direction (straight in and 45° to four sides). An ear is
  // thin whichever way it is pressed; the body is thick in every direction.
  _pressScale(a, n) {
    let tx = Math.abs(n[1]) < 0.9 ? -n[2] : 0, ty = Math.abs(n[1]) < 0.9 ? 0 : n[2], tz = Math.abs(n[1]) < 0.9 ? n[0] : -n[1];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl; ty /= tl; tz /= tl;
    const bx = n[1] * tz - n[2] * ty, by = n[2] * tx - n[0] * tz, bz = n[0] * ty - n[1] * tx;
    const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
    let thick = 2;
    const o = [a[0] + n[0] * 0.02, a[1] + n[1] * 0.02, a[2] + n[2] * 0.02];
    for (const [u, v] of dirs) {
      let dx = n[0] + u * tx + v * bx, dy = n[1] + u * ty + v * by, dz = n[2] + u * tz + v * bz;
      const l = Math.hypot(dx, dy, dz);
      dx /= l; dy /= l; dz /= l;
      const hit = raycastTriangles(this.x, this.mesh.surfFaces, o[0], o[1], o[2], dx, dy, dz);
      const d = hit ? hit.t + 0.02 : 2;
      if (d < thick) thick = d;
    }
    const k = Math.min(1, Math.max(0, (thick - 0.12) / 0.55));
    return Math.max(0.1, k * k);
  }

  _buildPatch(f, c) {
    // a pinch on a thin part (ear) holds a wider piece of it, so the pull spreads
    // into the ear's base instead of necking right at the fingertip
    const R = Math.max(f.radius * 1.5, 0.3) * (1 + 0.7 * (1 - (f.pressScale ?? 1)));
    const x = this.x, N = this.N;
    const ids = [], ws = [];
    for (let i = 0; i < N; i++) {
      const dx = x[i * 3] - c[0], dy = x[i * 3 + 1] - c[1], dz = x[i * 3 + 2] - c[2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < R * R) {
        const q = 1 - d2 / (R * R);
        ids.push(i);
        ws.push(q * q * (this.isSurf[i] ? 1 : 0.55));
      }
    }
    if (ids.length < 4) {
      const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => {
        const da = (x[a * 3] - c[0]) ** 2 + (x[a * 3 + 1] - c[1]) ** 2 + (x[a * 3 + 2] - c[2]) ** 2;
        const db = (x[b * 3] - c[0]) ** 2 + (x[b * 3 + 1] - c[1]) ** 2 + (x[b * 3 + 2] - c[2]) ** 2;
        return da - db;
      });
      for (const i of order.slice(0, 4)) if (!ids.includes(i)) { ids.push(i); ws.push(0.3); }
    }
    let wsum = 0;
    for (const w of ws) wsum += w;
    // total grip stiffness, shared by weight: the centre holds hardest and the edge
    // of the fingertip barely at all, so the dent blends smoothly into the skin
    const kTot = (8 * this.fingerF) / f.radius;
    f.idx = Int32Array.from(ids);
    f.k = Float64Array.from(ws, (w) => (kTot * w) / wsum);
    f.off = new Float64Array(ids.length * 3);
    f.lam = new Float64Array(ids.length);
    const xf0 = f.T[0] + f.s * f.n[0], xf1 = f.T[1] + f.s * f.n[1], xf2 = f.T[2] + f.s * f.n[2];
    ids.forEach((i, k) => {
      f.off[k * 3] = x[i * 3] - xf0;
      f.off[k * 3 + 1] = x[i * 3 + 1] - xf1;
      f.off[k * 3 + 2] = x[i * 3 + 2] - xf2;
    });
  }

  fingerMove(id, { ray, pressure }) {
    const f = this.fingers.get(id);
    if (!f || f.state !== 'down') return;
    if (pressure !== undefined) f.pressure = pressure;
    if (!ray) return;
    f.ray = [ray[0].slice(), ray[1].slice()];
    const [o, d] = ray;
    const n = f.pn;
    const den = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    if (Math.abs(den) < 1e-6) return;
    const t = ((f.A[0] - o[0]) * n[0] + (f.A[1] - o[1]) * n[1] + (f.A[2] - o[2]) * n[2]) / den;
    f.T1 = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  }

  // A lifted finger lets go over 50 ms; a slipping one over 25 ms (the pad
  // slides off quickly but not instantly, so a stretched ear recoils smoothly).
  fingerUp(id, slip = false) {
    const f = this.fingers.get(id);
    if (!f || f.state !== 'down') return null;
    f.state = 'release';
    f.relTime = slip ? 0.025 : 0.05;
    f.rel = 0;
    const info = {
      id,
      depth: f.maxDepth,
      stretch: Math.hypot(f.T[0] - f.A[0], f.T[1] - f.A[1], f.T[2] - f.A[2]),
      hold: f.hold,
      slipped: slip,
    };
    return info;
  }

  setPlate(tx, tz, held) {
    const r = Math.hypot(tx, tz), max = 1.1;
    const k = r > max ? max / r : 1;
    this.plate.tx = tx * k;
    this.plate.tz = tz * k;
    this.plate.held = held;
  }

  // dir (optional): horizontal unit direction [x, z] and speed [units/s] to hop
  // toward, e.g. back to the middle of the plate
  hop(power = 1, dir = null, speed = 0) {
    if (this.hopState || this.contacts < 3) return false;
    this.hopState = { t: 0, power, dir, speed };
    return true;
  }

  puff() {
    this.pout = 1e-6;
  }

  setSleep(on) {
    this.asleep = on;
  }

  // ---- stepping -----------------------------------------------------------------
  step(frameDt = 1 / 60) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const n = this.substeps;
    const h = frameDt / n;
    this.time += frameDt;
    this.frame++;
    this._frameBegin(frameDt);
    for (let s = 0; s < n; s++) {
      // the hard-limit passes run every other substep and always on the last
      this.lastSub = s === n - 1;
      this._substep(h, (s + 1) / n);
    }
    this._frameEnd(frameDt);
    if (t0) {
      const ms = performance.now() - t0;
      this.stats.stepMs = this.stats.stepMs ? this.stats.stepMs * 0.9 + ms * 0.1 : ms;
    }
    this.stats.substeps = n;
  }

  _frameBegin(dt) {
    // breathing & puffed cheeks act through the tets' volumetric rest state
    const b = this.breath;
    const amp = this.asleep ? 0.016 : b.amp;
    const freq = this.asleep ? 0.24 : b.freq;
    b.phase += dt * freq * 2 * Math.PI;
    this.breathSwell = 1 + amp * Math.sin(b.phase);
    this.volTarget = this.restVolume * this.breathSwell;
    if (this.pout > 0) {
      this.pout += dt;
      const t = this.pout;
      const env = t < 0.18 ? t / 0.18 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.45);
      const ct = this.mesh.cheekTets;
      for (let k = 0; k < ct.length; k += 2) this.swell[ct[k]] = 1 + 0.3 * ct[k + 1] * env;
      if (t > 2.1) { this.pout = 0; for (let k = 0; k < ct.length; k += 2) this.swell[ct[k]] = 1; }
    }
    this._creep(dt);

    for (const f of this.fingers.values()) {
      f.T0 = f.T.slice();
      f.fsum[0] = f.fsum[1] = f.fsum[2] = 0;
      f.slideCool = Math.max(0, f.slideCool - dt);
      if (f.state === 'down') {
        f.hold += dt;
        // a quick press reaches about half force at once; holding still pushes deeper
        const profile = 0.55 + 0.45 * (1 - Math.exp(-f.hold / 0.55));
        f.Ftarget = this.fingerF * Math.max(0, f.pressure) * profile * f.pressScale;
      } else {
        f.rel += dt;
        f.Ftarget = 0;
      }
    }
    if (this.hopState) {
      const hs = this.hopState;
      hs.t += dt;
    }
    const P = this.plate;
    if (this.fingers.size || this.hopState || P.held || Math.abs(P.vx) + Math.abs(P.vz) > 0.05) this.activeUntil = this.time + 1.5;
    this.active = this.time < (this.activeUntil || 0);
    this.contactsFrame = 0;
    this.landV = 0;
  }

  _substep(h, alpha) {
    const N = this.N, x = this.x, p = this.p, v = this.v, w = this.w, fx = this.fx;
    const g = this.gravity;
    const drag = Math.exp(-this.air * h);
    // hop: an upward push that reaches the base first (the body squashes at
    // take-off, then stretches in the air); everything after is simulated
    let launch = 0, hn0 = 0, lx = 0, lz = 0;
    const hs = this.hopState;
    if (hs) {
      hn0 = this.cm[1];
      if (hs.t >= 0.04 && !hs.launched) {
        hs.launched = true;
        launch = Math.sqrt(2 * g * 0.7) * hs.power;
        if (hs.dir) { lx = hs.dir[0] * hs.speed; lz = hs.dir[1] * hs.speed; }
      }
      if (hs.t > 0.5) this.hopState = null;
    }
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      let vx = v[o], vy = v[o + 1], vz = v[o + 2];
      vy -= g * h;
      if (w[i] > 0) {
        vx += fx[o] * w[i] * h; vy += fx[o + 1] * w[i] * h; vz += fx[o + 2] * w[i] * h;
      }
      if (launch) {
        const hn = Math.min(1, Math.max(0, (x[o + 1] - hn0) / 0.9 + 0.5));
        vy += launch * (1.06 - 0.12 * hn);
        vx += lx; vz += lz;
      }
      vx *= drag; vy *= drag; vz *= drag;
      v[o] = vx; v[o + 1] = vy; v[o + 2] = vz;
      p[o] = x[o]; p[o + 1] = x[o + 1]; p[o + 2] = x[o + 2];
      x[o] += vx * h; x[o + 1] += vy * h; x[o + 2] += vz * h;
    }
    this._platePredict(h);
    // fingers first: the material constraints that follow (with their hard strain
    // and volume limits) then always get the last word inside the body
    this._solveFingers(h, alpha);
    this._solveTets(h);
    this._solveVolume(h);
    this._solveSkin(h);
    this._shapeMatch(h);
    // Self-collision only matters while something squeezes or shakes the body;
    // every other substep is plenty for the speeds involved.
    if (this.active && (this.subCount % (this.substeps > 12 ? 3 : 2) === 0 || (this.active && this.lastSub))) this._selfCollide();
    this._solvePlate(h);
    // hard limits get the very last word (twice if the first pass had work)
    if (this.lastSub || (this.subCount & 1) === 0) {
      this._limitEdges();
      if (this._limitTets()) this._limitTets();
    }
    const ih = 1 / h;
    for (let i = 0; i < N * 3; i++) v[i] = (x[i] - p[i]) * ih;
    this._dashpots(h);
    this.subCount++;
  }

  _solveTets(h) {
    const x = this.x, w = this.w;
    const ih2 = 1 / (h * h);
    // (Kelvin–Voigt damping is applied implicitly at velocity level in _dashpots)
    const fwd = true; // a fixed order keeps the resting state a true fixed point

    // ---- edge springs: elastic + Maxwell branch in one constraint ----
    // ½k(L-L0)² + ½g1·k(L-Lv)² = ½(1+g1)k (L - L*)² + const,  L* = (L0 + g1·Lv)/(1+g1)
    {
      const A = this.eA, B = this.eB, K = this.eK, L0 = this.eL0, Lv = this.eLv, g1 = this.g1;
      const sc = 1 + g1, isc = 1 / sc;
      const nE = A.length;
      for (let k = 0; k < nE; k++) {
        const e = fwd ? k : nE - 1 - k;
        const i = A[e], j = B[e];
        const a = i * 3, b = j * 3;
        const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-9) continue;
        const nx = dx / L, ny = dy / L, nz = dz / L;
        const wa = w[i], wb = w[j];
        const l0 = L0[e];
        let dl;
        if (L < 0.45 * l0 || L > 3 * l0) {
          // strain limit: a hard projection back into [0.45, 3]·L0
          dl = -(L - (L < l0 ? 0.45 : 3) * l0) / (wa + wb);
        } else {
          const C = L - (l0 + g1 * Lv[e]) * isc;
          // strain stiffening (like real silicone near its limit): stiffer beyond
          // 1.5x stretch or 0.65x compression, which spreads extreme strain out
          const r = L / l0;
          const st = r > 1.5 ? 1 + 8 * (r - 1.5) * (r - 1.5) : r < 0.65 ? 1 + 30 * (0.65 - r) * (0.65 - r) : 1;
          const aT = ih2 / (K[e] * sc * st);
          dl = -C / (wa + wb + aT);
        }
        x[a] += wa * nx * dl; x[a + 1] += wa * ny * dl; x[a + 2] += wa * nz * dl;
        x[b] -= wb * nx * dl; x[b + 1] -= wb * ny * dl; x[b + 2] -= wb * nz * dl;
      }
    }

    // ---- tet volumes (bulk modulus beyond the network's own), plus hard limits
    // of 35%..220% of the rest volume ----
    {
      const T = this.tets, V = this.V, SW = this.swell, nT = this.nT;
      const kv = this.kVol * (1 + this.g1), breath = this.breathSwell || 1;
      for (let k = 0; k < nT; k++) {
        const t = fwd ? nT - 1 - k : k;
        const ia = T[t * 4], ib = T[t * 4 + 1], ic = T[t * 4 + 2], id = T[t * 4 + 3];
        const a = ia * 3, b = ib * 3, c = ic * 3, d = id * 3;
        const x0 = x[a], y0 = x[a + 1], z0 = x[a + 2];
        const d1x = x[b] - x0, d1y = x[b + 1] - y0, d1z = x[b + 2] - z0;
        const d2x = x[c] - x0, d2y = x[c + 1] - y0, d2z = x[c + 2] - z0;
        const d3x = x[d] - x0, d3y = x[d + 1] - y0, d3z = x[d + 2] - z0;
        // gradients of V = d1·(d2×d3)/6
        const g1x = (d2y * d3z - d2z * d3y) / 6, g1y = (d2z * d3x - d2x * d3z) / 6, g1z = (d2x * d3y - d2y * d3x) / 6;
        const g2x = (d3y * d1z - d3z * d1y) / 6, g2y = (d3z * d1x - d3x * d1z) / 6, g2z = (d3x * d1y - d3y * d1x) / 6;
        const g3x = (d1y * d2z - d1z * d2y) / 6, g3y = (d1z * d2x - d1x * d2z) / 6, g3z = (d1x * d2y - d1y * d2x) / 6;
        const g0x = -(g1x + g2x + g3x), g0y = -(g1y + g2y + g3y), g0z = -(g1z + g2z + g3z);
        const vol = d1x * g1x + d1y * g1y + d1z * g1z;
        const V0 = V[t];
        const w0 = w[ia], w1 = w[ib], w2 = w[ic], w3 = w[id];
        const ws = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
          w2 * (g2x * g2x + g2y * g2y + g2z * g2z) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
        if (ws < 1e-30) continue;
        let dl;
        if (vol < 0.35 * V0 || vol > 2.2 * V0) {
          // hard limits: no tet is crushed, inverted or blown up
          dl = -(vol - (vol < V0 ? 0.35 : 2.2) * V0) / ws;
        } else if (kv > 0) {
          const C = vol - V0 * SW[t] * breath;
          const aT = (V0 / kv) * ih2; // energy ½(K/V0)(V-V0)²
          dl = -C / (ws + aT);
        } else continue;
        x[a] += w0 * g0x * dl; x[a + 1] += w0 * g0y * dl; x[a + 2] += w0 * g0z * dl;
        x[b] += w1 * g1x * dl; x[b + 1] += w1 * g1y * dl; x[b + 2] += w1 * g1z * dl;
        x[c] += w2 * g2x * dl; x[c + 1] += w2 * g2y * dl; x[c + 2] += w2 * g2z * dl;
        x[d] += w3 * g3x * dl; x[d + 1] += w3 * g3y * dl; x[d + 2] += w3 * g3z * dl;
      }
    }
  }

  // Kelvin–Voigt viscosity as implicit dashpots along every tet edge, applied to
  // the velocities after the position solve. Each dashpot (coefficient β·k_e,
  // i.e. stiffness-proportional Rayleigh damping) scales the relative velocity
  // of its two particles along the edge by 1/(1 + β·k_e·h·(w_i + w_j)): it can
  // only remove energy, so it is stable for any β. Rigid motion does not change
  // edge lengths and is not damped; short stiff edges (high frequencies, i.e.
  // jitter) are damped hardest.
  _dashpots(h) {
    const c = this.beta * h * (1 + this.g1);
    if (c <= 0) return;
    const x = this.x, v = this.v, w = this.w, A = this.eA, B = this.eB, K = this.eK;
    for (let e = 0, nE = A.length; e < nE; e++) {
      const i = A[e], j = B[e];
      const a = i * 3, b = j * 3;
      let dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (L < 1e-9) continue;
      dx /= L; dy /= L; dz /= L;
      const rel = (v[b] - v[a]) * dx + (v[b + 1] - v[a + 1]) * dy + (v[b + 2] - v[a + 2]) * dz;
      const ws = w[i] + w[j];
      const k = c * K[e] * ws;
      const P = (rel * k) / ((1 + k) * ws);
      v[a] += w[i] * P * dx; v[a + 1] += w[i] * P * dy; v[a + 2] += w[i] * P * dz;
      v[b] -= w[j] * P * dx; v[b + 1] -= w[j] * P * dy; v[b + 2] -= w[j] * P * dz;
    }
  }

  // Hard strain limit on every tet edge (no tearing-like overstretch survives a
  // substep, whatever the grip or the collisions did).
  _limitEdges() {
    const x = this.x, w = this.w, A = this.eA, B = this.eB, L0 = this.eL0;
    for (let e = 0, nE = A.length; e < nE; e++) {
      const i = A[e], j = B[e];
      const a = i * 3, b = j * 3;
      const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2];
      const L2 = dx * dx + dy * dy + dz * dz;
      const lmax = 3 * L0[e];
      if (L2 <= lmax * lmax) continue;
      const L = Math.sqrt(L2);
      const ws = w[i] + w[j];
      const c = (L - lmax) / (L * ws);
      x[a] -= dx * c * w[i]; x[a + 1] -= dy * c * w[i]; x[a + 2] -= dz * c * w[i];
      x[b] += dx * c * w[j]; x[b + 1] += dy * c * w[j]; x[b + 2] += dz * c * w[j];
    }
  }

  // Last line of defence after every other constraint: hard volume limits only
  // (no compliance), so that no tet ends a substep crushed, inverted or blown up.
  _limitTets() {
    const x = this.x, w = this.w, T = this.tets, V = this.V, nT = this.nT;
    let fixed = 0;
    for (let t = 0; t < nT; t++) {
      const ia = T[t * 4], ib = T[t * 4 + 1], ic = T[t * 4 + 2], id = T[t * 4 + 3];
      const a = ia * 3, b = ib * 3, c = ic * 3, d = id * 3;
      const x0 = x[a], y0 = x[a + 1], z0 = x[a + 2];
      const d1x = x[b] - x0, d1y = x[b + 1] - y0, d1z = x[b + 2] - z0;
      const d2x = x[c] - x0, d2y = x[c + 1] - y0, d2z = x[c + 2] - z0;
      const d3x = x[d] - x0, d3y = x[d + 1] - y0, d3z = x[d + 2] - z0;
      const c1x = d2y * d3z - d2z * d3y, c1y = d2z * d3x - d2x * d3z, c1z = d2x * d3y - d2y * d3x;
      const vol = (d1x * c1x + d1y * c1y + d1z * c1z) / 6;
      const V0 = V[t];
      if (vol > 0.3 * V0 && vol < 2.4 * V0) continue;
      const g1x = c1x / 6, g1y = c1y / 6, g1z = c1z / 6;
      const g2x = (d3y * d1z - d3z * d1y) / 6, g2y = (d3z * d1x - d3x * d1z) / 6, g2z = (d3x * d1y - d3y * d1x) / 6;
      const g3x = (d1y * d2z - d1z * d2y) / 6, g3y = (d1z * d2x - d1x * d2z) / 6, g3z = (d1x * d2y - d1y * d2x) / 6;
      const g0x = -(g1x + g2x + g3x), g0y = -(g1y + g2y + g3y), g0z = -(g1z + g2z + g3z);
      const w0 = w[ia], w1 = w[ib], w2 = w[ic], w3 = w[id];
      const ws = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
        w2 * (g2x * g2x + g2y * g2y + g2z * g2z) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
      if (ws < 1e-30) continue;
      const dl = -(vol - (vol < V0 ? 0.3 : 2.4) * V0) / ws;
      x[a] += w0 * g0x * dl; x[a + 1] += w0 * g0y * dl; x[a + 2] += w0 * g0z * dl;
      x[b] += w1 * g1x * dl; x[b + 1] += w1 * g1y * dl; x[b + 2] += w1 * g1z * dl;
      x[c] += w2 * g2x * dl; x[c + 1] += w2 * g2y * dl; x[c + 2] += w2 * g2z * dl;
      x[d] += w3 * g3x * dl; x[d + 1] += w3 * g3y * dl; x[d + 2] += w3 * g3z * dl;
      fixed++;
    }
    return fixed;
  }

  _solveSkin(h) {
    const x = this.x, w = this.w;
    const ih2 = 1 / (h * h);
    if (this.kEdge > 0) {
      const E = this.mesh.surfEdges, L0 = this.edgeRest;
      const alpha = 1 / this.kEdge;
      const aT = alpha * ih2;
      for (let e = 0, ne = L0.length; e < ne; e++) {
        const ia = E[e * 2], ib = E[e * 2 + 1];
        const a = ia * 3, b = ib * 3;
        const dx = x[a] - x[b], dy = x[a + 1] - x[b + 1], dz = x[a + 2] - x[b + 2];
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-9) continue;
        const nx = dx / L, ny = dy / L, nz = dz / L;
        const wa = w[ia], wb = w[ib];
        const dl = -(L - L0[e]) / (wa + wb + aT);
        x[a] += wa * nx * dl; x[a + 1] += wa * ny * dl; x[a + 2] += wa * nz * dl;
        x[b] -= wb * nx * dl; x[b + 1] -= wb * ny * dl; x[b + 2] -= wb * nz * dl;
      }
    }
    if (this.kLap > 0) {
      // Laplacian (umbrella) bending: the normal component of the differential
      // coordinate δ = x_i - mean(ring), i.e. the discrete mean curvature, should
      // keep its rest value. Measured along the current normal (the enclosed-volume
      // gradient), so it is rotation invariant and never fights a tilted ear.
      const S = this.mesh.surfIds, rs = this.mesh.ringStart, rl = this.mesh.ringList, H0 = this.curv0, gv = this.gradV;
      const aT = ih2 / this.kLap;
      for (let k = 0, nS = S.length; k < nS; k++) {
        const i = S[k], o = i * 3;
        const r0 = rs[k], r1 = rs[k + 1], n = r1 - r0;
        if (n < 3) continue;
        let nx = gv[o], ny = gv[o + 1], nz = gv[o + 2];
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (nl < 1e-12) continue;
        nx /= nl; ny /= nl; nz /= nl;
        let mx = 0, my = 0, mz = 0, wr = 0;
        for (let r = r0; r < r1; r++) {
          const j = rl[r];
          mx += x[j * 3]; my += x[j * 3 + 1]; mz += x[j * 3 + 2];
          wr += w[j];
        }
        const inv = 1 / n;
        const C = (x[o] - mx * inv) * nx + (x[o + 1] - my * inv) * ny + (x[o + 2] - mz * inv) * nz - H0[k];
        const dl = -C / (w[i] + wr * inv * inv + aT);
        x[o] += w[i] * nx * dl; x[o + 1] += w[i] * ny * dl; x[o + 2] += w[i] * nz * dl;
        for (let r = r0; r < r1; r++) {
          const j = rl[r], q = w[j] * inv * dl;
          x[j * 3] -= q * nx; x[j * 3 + 1] -= q * ny; x[j * 3 + 2] -= q * nz;
        }
      }
    }
  }

  _solveVolume(h) {
    const x = this.x, w = this.w, F = this.mesh.surfFaces, gv = this.gradV, S = this.mesh.surfIds;
    for (let k = 0; k < S.length; k++) { const o = S[k] * 3; gv[o] = gv[o + 1] = gv[o + 2] = 0; }
    let V = 0;
    for (let f = 0; f < F.length; f += 3) {
      const a = F[f] * 3, b = F[f + 1] * 3, c = F[f + 2] * 3;
      const ax = x[a], ay = x[a + 1], az = x[a + 2], bx = x[b], by = x[b + 1], bz = x[b + 2], cx = x[c], cy = x[c + 1], cz = x[c + 2];
      const bcx = by * cz - bz * cy, bcy = bz * cx - bx * cz, bcz = bx * cy - by * cx;
      V += ax * bcx + ay * bcy + az * bcz;
      gv[a] += bcx; gv[a + 1] += bcy; gv[a + 2] += bcz;
      gv[b] += cy * az - cz * ay; gv[b + 1] += cz * ax - cx * az; gv[b + 2] += cx * ay - cy * ax;
      gv[c] += ay * bz - az * by; gv[c + 1] += az * bx - ax * bz; gv[c + 2] += ax * by - ay * bx;
    }
    V /= 6;
    this.volume = V;
    let wsum = 0;
    for (let k = 0; k < S.length; k++) {
      const i = S[k], o = i * 3;
      gv[o] /= 6; gv[o + 1] /= 6; gv[o + 2] /= 6;
      wsum += w[i] * (gv[o] * gv[o] + gv[o + 1] * gv[o + 1] + gv[o + 2] * gv[o + 2]);
    }
    // A weak internal pressure (the tets carry the bulk modulus): it only evens
    // out the enclosed volume, and its per-substep push is clamped so it can
    // never inflate thin surface tets.
    const alpha = this.restVolume / (0.5 * this.bulk);
    let dl = -(V - this.volTarget) / (wsum + alpha / (h * h));
    let gmax = 0;
    for (let k = 0; k < S.length; k++) {
      const i = S[k], o = i * 3;
      gmax = Math.max(gmax, w[i] * Math.sqrt(gv[o] * gv[o] + gv[o + 1] * gv[o + 1] + gv[o + 2] * gv[o + 2]));
    }
    const maxMove = 0.0015;
    if (Math.abs(dl) * gmax > maxMove) dl = (Math.sign(dl) * maxMove) / gmax;
    for (let k = 0; k < S.length; k++) {
      const i = S[k], o = i * 3, q = w[i] * dl;
      x[o] += gv[o] * q; x[o + 1] += gv[o + 1] * q; x[o + 2] += gv[o + 2] * q;
    }
  }

  _shapeMatch(h) {
    const N = this.N, x = this.x, m = this.mass, Xr = this.Xrel, A = this.A;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { cx += x[i * 3] * m[i]; cy += x[i * 3 + 1] * m[i]; cz += x[i * 3 + 2] * m[i]; }
    const iM = 1 / this.totalMass;
    cx *= iM; cy *= iM; cz *= iM;
    A.fill(0);
    for (let i = 0; i < N; i++) {
      const o = i * 3, mi = m[i];
      const px = (x[o] - cx) * mi, py = (x[o + 1] - cy) * mi, pz = (x[o + 2] - cz) * mi;
      const qx = Xr[o], qy = Xr[o + 1], qz = Xr[o + 2];
      A[0] += px * qx; A[1] += px * qy; A[2] += px * qz;
      A[3] += py * qx; A[4] += py * qy; A[5] += py * qz;
      A[6] += pz * qx; A[7] += pz * qy; A[8] += pz * qz;
    }
    extractRotation(A, this.q, 3);
    const R = quatToMat(this.q, this.R);
    this.cm[0] = cx; this.cm[1] = cy; this.cm[2] = cz;
    const om = this.smOmega;
    if (om <= 0) return;
    const k = (om * om * h * h) / (1 + om * om * h * h);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const qx = Xr[o], qy = Xr[o + 1], qz = Xr[o + 2];
      const gx = R[0] * qx + R[1] * qy + R[2] * qz + cx;
      const gy = R[3] * qx + R[4] * qy + R[5] * qz + cy;
      const gz = R[6] * qx + R[7] * qy + R[8] * qz + cz;
      x[o] += (gx - x[o]) * k; x[o + 1] += (gy - x[o + 1]) * k; x[o + 2] += (gz - x[o + 2]) * k;
    }
  }

  _solveFingers(h, alpha) {
    if (!this.fingers.size) return;
    const x = this.x, w = this.w;
    const ih2 = 1 / (h * h);
    const sMax = 0.62, sMin = -0.25;
    const mF = 0.18; // fingertip effective mass (internal units, about 13 g)
    const wF = 1 / mF;
    const dampF = Math.exp(-90 * h);
    const att = 1 - Math.exp(-h / 0.03);
    for (const f of this.fingers.values()) {
      // kinematic target follows the pointer smoothly across the frame's substeps
      f.T[0] = f.T0[0] + (f.T1[0] - f.T0[0]) * alpha;
      f.T[1] = f.T0[1] + (f.T1[1] - f.T0[1]) * alpha;
      f.T[2] = f.T0[2] + (f.T1[2] - f.T0[2]) * alpha;
      // press depth: driven by the finger force, resisted by the material
      f.F += (f.Ftarget - f.F) * att;
      let fade = 1;
      if (f.state === 'release') {
        fade = Math.max(0, 1 - f.rel / f.relTime);
        if (fade <= 0) continue;
      }
      // When the patch is being pulled away (tension), nothing pushes back on the
      // fingertip, so it holds its depth instead of sinking in.
      if (f.tension) f.vs = Math.min(0, f.vs);
      else f.vs = (f.vs + h * f.F * wF) * dampF;
      const sPrev = f.s;
      f.s += h * f.vs;
      const cap = sMax * Math.max(0.15, f.pressScale);
      if (f.s > cap) { f.s = cap; if (f.vs > 0) f.vs = 0; }
      if (f.s < sMin) { f.s = sMin; if (f.vs < 0) f.vs = 0; }
      const n0 = f.n[0], n1 = f.n[1], n2 = f.n[2];
      const idx = f.idx, off = f.off, K = f.k;
      let fx = 0, fy = 0, fz = 0;
      for (let j = 0, m = idx.length; j < m; j++) {
        const i = idx[j], o = i * 3;
        const kk = K[j] * fade;
        if (kk <= 0) continue;
        const tx = f.T[0] + f.s * n0 + off[j * 3];
        const ty = f.T[1] + f.s * n1 + off[j * 3 + 1];
        const tz = f.T[2] + f.s * n2 + off[j * 3 + 2];
        const dx = x[o] - tx, dy = x[o + 1] - ty, dz = x[o + 2] - tz;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (L < 1e-9) continue;
        const gx = dx / L, gy = dy / L, gz = dz / L;
        const gn = gx * n0 + gy * n1 + gz * n2;
        const aT = ih2 / kk;
        let dl = -L / (w[i] + wF * gn * gn + aT);
        // The skin can push the fingertip back out, but it cannot pull it deeper:
        // a pinched ear that is stretched must not drag the finger into the head.
        if (-wF * gn * dl > 0) dl = -L / (w[i] + aT);
        else f.s -= wF * gn * dl;
        x[o] += w[i] * gx * dl; x[o + 1] += w[i] * gy * dl; x[o + 2] += w[i] * gz * dl;
        fx += gx * dl; fy += gy * dl; fz += gz * dl;
      }
      if (f.s > cap) f.s = cap;
      if (f.s < sMin) f.s = sMin;
      f.vs = (f.s - sPrev) / h;
      // tension = the user is pulling the patch away (dragged, and the skin pulls
      // the fingertip in harder than the body's own weight hanging on it would)
      const pulled = (f.T[0] - f.A[0]) ** 2 + (f.T[1] - f.A[1]) ** 2 + (f.T[2] - f.A[2]) ** 2 > 0.0025;
      f.tension = pulled && (fx * n0 + fy * n1 + fz * n2) * ih2 < -0.3 / UNIT.force;
      // force the finger exerts on the body this substep
      f.fsum[0] += fx * ih2; f.fsum[1] += fy * ih2; f.fsum[2] += fz * ih2;
    }
  }

  _selfCollide() {
    const S = this.mesh.surfIds, nS = S.length, x = this.x, w = this.w, X = this.X, R = this.colR;
    const hash = this.hash;
    hash.create(x, S, nS);
    const maxD = 2 * this.colRMax;
    for (let k = 0; k < nS; k++) {
      const i = S[k], o = i * 3;
      const q = hash.query(x[o], x[o + 1], x[o + 2], maxD);
      for (let m = 0; m < q; m++) {
        const j = hash.queryIds[m];
        if (j <= i) continue;
        const p = j * 3;
        const minD = R[i] + R[j];
        const dx = x[o] - x[p], dy = x[o + 1] - x[p + 1], dz = x[o + 2] - x[p + 2];
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= minD * minD || d2 < 1e-14) continue;
        // particles that are close in the rest shape are neighbours, not a collision
        const rx = X[o] - X[p], ry = X[o + 1] - X[p + 1], rz = X[o + 2] - X[p + 2];
        if (rx * rx + ry * ry + rz * rz < 4.4 * minD * minD) continue;
        const d = Math.sqrt(d2);
        const c = (minD - d) / (d * (w[i] + w[j]));
        x[o] += dx * c * w[i]; x[o + 1] += dy * c * w[i]; x[o + 2] += dz * c * w[i];
        x[p] -= dx * c * w[j]; x[p + 1] -= dy * c * w[j]; x[p + 2] -= dz * c * w[j];
      }
    }
  }

  _platePredict(h) {
    const P = this.plate;
    P.px = P.x; P.pz = P.z;
    // the hand moves the plate: a stiff critically damped follow of the target
    const om = P.held ? 38 : 24;
    const ax = om * om * (P.tx - P.x) - 2 * om * P.vx;
    const az = om * om * (P.tz - P.z) - 2 * om * P.vz;
    P.vx += ax * h; P.vz += az * h;
    P.x += P.vx * h; P.z += P.vz * h;
    if (!P.held && Math.abs(P.tx) + Math.abs(P.tz) > 0) { P.tx = 0; P.tz = 0; }
  }

  _solvePlate(h) {
    const N = this.N, x = this.x, p = this.p, P = this.plate;
    const dpx = P.x - P.px, dpz = P.z - P.pz;
    const muS = this.mu, muK = this.mu * 0.75;
    let contacts = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      const lx = x[o] - P.x, lz = x[o + 2] - P.z;
      const r = Math.sqrt(lx * lx + lz * lz);
      // plate profile: flat dish, rim rising from r = 1.42 to 1.86
      let fy = 0, sl = 0;
      if (r > 1.42) {
        const u = Math.min(1, (r - 1.42) / 0.44);
        fy = 0.125 * u * u * (3 - 2 * u);
        sl = r < 1.86 ? (0.125 * 6 * u * (1 - u)) / 0.44 : 0;
      }
      fy += this.floorPad[i];
      const y = x[o + 1];
      if (y >= fy) continue;
      contacts++;
      // contact normal of the profile
      let nx = 0, ny = 1, nz = 0;
      if (sl > 0 && r > 1e-6) {
        const l = Math.sqrt(1 + sl * sl);
        nx = (-sl * lx) / r / l; nz = (-sl * lz) / r / l; ny = 1 / l;
      }
      const pen = (fy - y) * ny;
      if (this.v[o + 1] < -this.landV) this.landV = -this.v[o + 1];
      x[o] += nx * pen; x[o + 1] += ny * pen; x[o + 2] += nz * pen;
      // only the base touches the plate; particles held at their pad above it
      // just get the normal push
      if (this.floorPad[i] > 0.004) continue;
      // friction relative to the moving plate (Macklin et al. 2014)
      let rx = x[o] - p[o] - dpx, ry = x[o + 1] - p[o + 1], rz = x[o + 2] - p[o + 2] - dpz;
      const rn = rx * nx + ry * ny + rz * nz;
      rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
      const rt = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (rt > 1e-12) {
        const k = rt < muS * pen ? 1 : Math.min(1, (muK * pen) / rt);
        x[o] -= rx * k; x[o + 1] -= ry * k; x[o + 2] -= rz * k;
      }
      // keep everything inside the rim
      if (r > 1.9) {
        const s = 1.9 / r;
        x[o] = P.x + lx * s; x[o + 2] = P.z + lz * s;
      }
    }
    this.contactsFrame = Math.max(this.contactsFrame, contacts);
  }

  _frameEnd(dt) {
    // contact bookkeeping for landing events
    const c = this.contactsFrame;
    if (c === 0) this.airFrames++;
    else {
      if (this.airFrames > 3 && this.landV > 1) this.events.push({ type: 'land', impact: this.landV * UNIT.L });
      this.airFrames = 0;
    }
    this.contacts = c;
    if (this.hopState && this.hopState.launched && !this.hopState.sent) {
      this.hopState.sent = true;
      this.events.push({ type: 'jump' });
    }

    // finger forces, friction and slipping
    const n = this.substeps;
    for (const [id, f] of this.fingers) {
      if (f.state === 'release') {
        if (f.rel >= f.relTime) this.fingers.delete(id);
        continue;
      }
      // fsum is the force the fingertip exerted on the body (averaged over the
      // substeps); split it into the press along n and the shear across it
      const Fx = f.fsum[0] / n, Fy = f.fsum[1] / n, Fz = f.fsum[2] / n;
      const fn = Fx * f.n[0] + Fy * f.n[1] + Fz * f.n[2];
      const tx = Fx - fn * f.n[0], ty = Fy - fn * f.n[1], tz = Fz - fn * f.n[2];
      const ft = Math.hypot(tx, ty, tz);
      const k = 1 - Math.exp(-dt / 0.035);
      f.fnEMA += (fn - f.fnEMA) * k;
      f.ftEMA += (ft - f.ftEMA) * k;
      f.fn = fn;
      f.ft = ft;
      f.maxDepth = Math.max(f.maxDepth, f.s);
      f.xf = [f.T[0] + f.s * f.n[0], f.T[1] + f.s * f.n[1], f.T[2] + f.s * f.n[2]];
      const Fn = UNIT.force;
      const pullLimit = 1.6 / Fn; // pinch grip on tacky silicone [N]
      const tack = 0.45 / Fn;
      const stretch = Math.hypot(f.T[0] - f.A[0], f.T[1] - f.A[1], f.T[2] - f.A[2]);
      // on a thin part (ear) the fingers pinch it, so sliding is limited by the
      // pinch grip rather than by press friction
      const pinch = f.pressScale < 0.5;
      const slideLimit = pinch ? pullLimit : this.mu * Math.max(0, f.fnEMA) + tack;
      if (f.fnEMA < -pullLimit || stretch > 1.1 || (pinch && f.ftEMA > pullLimit * 1.2)) {
        this.fingerUp(id, true);
        this.events.push({ type: 'slip', id });
        continue;
      }
      if (!pinch && f.slideCool <= 0 && f.ftEMA > slideLimit) {
        // Coulomb friction exceeded: the fingertip slides to the surface under it
        if (!this._regrab(f)) {
          this.fingerUp(id, true);
          this.events.push({ type: 'slip', id });
        } else {
          f.slides++;
          f.slideCool = 0.035;
          this.events.push({ type: 'slide', id });
        }
      }
    }

    // per-particle affine maps for the renderer + dents
    this._outputs();

    // adaptive substeps are managed by the caller (it knows the frame budget)
  }

  _regrab(f) {
    if (!f.ray) return false;
    const [o, d] = f.ray;
    const hit = raycastTriangles(this.x, this.mesh.surfFaces, o[0], o[1], o[2], d[0], d[1], d[2]);
    if (!hit) return false;
    const N = hit.normal;
    // press direction: mostly into the surface, partly along the view ray
    let nx = -0.65 * N[0] + 0.35 * d[0], ny = -0.65 * N[1] + 0.35 * d[1], nz = -0.65 * N[2] + 0.35 * d[2];
    const l = Math.hypot(nx, ny, nz) || 1;
    f.A = hit.point.slice();
    f.n = [nx / l, ny / l, nz / l];
    f.T = f.A.slice();
    f.T0 = f.A.slice();
    f.T1 = f.A.slice();
    f.s = 0;
    f.vs = 0;
    f.fnEMA = Math.max(0, f.fnEMA);
    f.ftEMA = 0;
    f.pressScale = this._pressScale(f.A, f.n);
    this._buildPatch(f, f.A);
    return true;
  }

  _outputs() {
    const N = this.N, T = this.nT, x = this.x, tets = this.tets, D = this.Dinv, Fa = this.Facc, V = this.V;
    Fa.fill(0);
    for (let t = 0; t < T; t++) {
      const ia = tets[t * 4], ib = tets[t * 4 + 1], ic = tets[t * 4 + 2], id = tets[t * 4 + 3];
      const a = ia * 3, b = ib * 3, c = ic * 3, d = id * 3;
      const s00 = x[b] - x[a], s10 = x[b + 1] - x[a + 1], s20 = x[b + 2] - x[a + 2];
      const s01 = x[c] - x[a], s11 = x[c + 1] - x[a + 1], s21 = x[c + 2] - x[a + 2];
      const s02 = x[d] - x[a], s12 = x[d + 1] - x[a + 1], s22 = x[d + 2] - x[a + 2];
      const o = t * 9, vol = V[t];
      const f00 = (s00 * D[o] + s01 * D[o + 3] + s02 * D[o + 6]) * vol;
      const f01 = (s00 * D[o + 1] + s01 * D[o + 4] + s02 * D[o + 7]) * vol;
      const f02 = (s00 * D[o + 2] + s01 * D[o + 5] + s02 * D[o + 8]) * vol;
      const f10 = (s10 * D[o] + s11 * D[o + 3] + s12 * D[o + 6]) * vol;
      const f11 = (s10 * D[o + 1] + s11 * D[o + 4] + s12 * D[o + 7]) * vol;
      const f12 = (s10 * D[o + 2] + s11 * D[o + 5] + s12 * D[o + 8]) * vol;
      const f20 = (s20 * D[o] + s21 * D[o + 3] + s22 * D[o + 6]) * vol;
      const f21 = (s20 * D[o + 1] + s21 * D[o + 4] + s22 * D[o + 7]) * vol;
      const f22 = (s20 * D[o + 2] + s21 * D[o + 5] + s22 * D[o + 8]) * vol;
      for (let k = 0; k < 4; k++) {
        const q = tets[t * 4 + k] * 9;
        Fa[q] += f00; Fa[q + 1] += f01; Fa[q + 2] += f02;
        Fa[q + 3] += f10; Fa[q + 4] += f11; Fa[q + 5] += f12;
        Fa[q + 6] += f20; Fa[q + 7] += f21; Fa[q + 8] += f22;
      }
    }
    // dents: inward offset from the shape-matched rest pose, minus a baseline
    // that only learns the static sag under gravity (it adapts while nothing has
    // touched the body for a while), so slow viscoelastic recovery stays visible
    const R = this.R, cm = this.cm, Xr = this.Xrel, RN = this.mesh.restN;
    if (this.fingers.size || this.hopState || this.pout > 0) this.quietSince = this.time;
    const quiet = this.time - (this.quietSince || 0);
    const kb = quiet > 3 ? 0.012 : 0;
    let ke = 0;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      ke += 0.5 * this.mass[i] * (this.v[o] ** 2 + this.v[o + 1] ** 2 + this.v[o + 2] ** 2);
      const iv = 1 / this.Vacc[i];
      const q = i * 9;
      for (let k = 0; k < 9; k++) Fa[q + k] *= iv;
      if (!this.isSurf[i]) { this.dent[i] = 0; continue; }
      const qx = Xr[o], qy = Xr[o + 1], qz = Xr[o + 2];
      const gx = R[0] * qx + R[1] * qy + R[2] * qz + cm[0];
      const gy = R[3] * qx + R[4] * qy + R[5] * qz + cm[1];
      const gz = R[6] * qx + R[7] * qy + R[8] * qz + cm[2];
      const nx = R[0] * RN[o] + R[1] * RN[o + 1] + R[2] * RN[o + 2];
      const ny = R[3] * RN[o] + R[4] * RN[o + 1] + R[5] * RN[o + 2];
      const nz = R[6] * RN[o] + R[7] * RN[o + 1] + R[8] * RN[o + 2];
      const dn = -((x[o] - gx) * nx + (x[o + 1] - gy) * ny + (x[o + 2] - gz) * nz);
      this.dentBase[i] += (dn - this.dentBase[i]) * kb;
      this.dent[i] = dn - this.dentBase[i];
    }
    this.stats.ke = ke * UNIT.M * UNIT.L * UNIT.L;
  }

  // Pack the state for the renderer: per particle 4 RGBA texels
  //   [F row 0 | c.x] [F row 1 | c.y] [F row 2 | c.z] [dent, J, 0, 0]
  // so that a rest point r maps to  p = F r + c  around that particle.
  writeAffine(out) {
    const N = this.N, Fa = this.Facc, x = this.x, X = this.X;
    for (let i = 0; i < N; i++) {
      const q = i * 9, o = i * 3, k = i * 16;
      const f00 = Fa[q], f01 = Fa[q + 1], f02 = Fa[q + 2];
      const f10 = Fa[q + 3], f11 = Fa[q + 4], f12 = Fa[q + 5];
      const f20 = Fa[q + 6], f21 = Fa[q + 7], f22 = Fa[q + 8];
      const X0 = X[o], X1 = X[o + 1], X2 = X[o + 2];
      out[k] = f00; out[k + 1] = f01; out[k + 2] = f02; out[k + 3] = x[o] - (f00 * X0 + f01 * X1 + f02 * X2);
      out[k + 4] = f10; out[k + 5] = f11; out[k + 6] = f12; out[k + 7] = x[o + 1] - (f10 * X0 + f11 * X1 + f12 * X2);
      out[k + 8] = f20; out[k + 9] = f21; out[k + 10] = f22; out[k + 11] = x[o + 2] - (f20 * X0 + f21 * X1 + f22 * X2);
      out[k + 12] = this.dent[i];
      out[k + 13] = f00 * (f11 * f22 - f12 * f21) - f01 * (f10 * f22 - f12 * f20) + f02 * (f10 * f21 - f11 * f20);
      out[k + 14] = 0;
      out[k + 15] = 0;
    }
    return out;
  }

  fingerInfo() {
    const out = [];
    for (const f of this.fingers.values()) {
      out.push({
        id: f.id,
        state: f.state,
        xf: f.xf,
        n: f.n,
        radius: f.radius,
        depth: f.s,
        stretch: Math.hypot(f.T[0] - f.A[0], f.T[1] - f.A[1], f.T[2] - f.A[2]),
        force: f.fn * UNIT.force,
        shear: f.ft * UNIT.force,
        hold: f.hold,
        fade: f.state === 'release' ? Math.max(0, 1 - f.rel / f.relTime) : 1,
      });
    }
    return out;
  }

  // diagnostics for tests
  diagnostics() {
    const x = this.x, T = this.tets, ID = this.invDet;
    let inverted = 0, minJ = Infinity, maxJ = -Infinity, nan = 0;
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i])) nan++;
    for (let t = 0; t < this.nT; t++) {
      const a = T[t * 4] * 3, b = T[t * 4 + 1] * 3, c = T[t * 4 + 2] * 3, d = T[t * 4 + 3] * 3;
      const d1x = x[b] - x[a], d1y = x[b + 1] - x[a + 1], d1z = x[b + 2] - x[a + 2];
      const d2x = x[c] - x[a], d2y = x[c + 1] - x[a + 1], d2z = x[c + 2] - x[a + 2];
      const d3x = x[d] - x[a], d3y = x[d + 1] - x[a + 1], d3z = x[d + 2] - x[a + 2];
      const J = (d1x * (d2y * d3z - d2z * d3y) - d1y * (d2x * d3z - d2z * d3x) + d1z * (d2x * d3y - d2y * d3x)) * ID[t];
      if (J <= 0) inverted++;
      if (J < minJ) minJ = J;
      if (J > maxJ) maxJ = J;
    }
    // surface edge stretch
    const E = this.mesh.surfEdges, L0 = this.edgeRest;
    let maxStretch = 0, minStretch = Infinity;
    for (let e = 0; e < L0.length; e++) {
      const a = E[e * 2] * 3, b = E[e * 2 + 1] * 3;
      const L = Math.hypot(x[a] - x[b], x[a + 1] - x[b + 1], x[a + 2] - x[b + 2]) / L0[e];
      if (L > maxStretch) maxStretch = L;
      if (L < minStretch) minStretch = L;
    }
    // shape error vs the rigidly fitted rest shape
    const R = this.R, cm = this.cm, Xr = this.Xrel;
    let err = 0, maxErr = 0;
    for (let i = 0; i < this.N; i++) {
      const o = i * 3, qx = Xr[o], qy = Xr[o + 1], qz = Xr[o + 2];
      const ex = x[o] - (R[0] * qx + R[1] * qy + R[2] * qz + cm[0]);
      const ey = x[o + 1] - (R[3] * qx + R[4] * qy + R[5] * qz + cm[1]);
      const ez = x[o + 2] - (R[6] * qx + R[7] * qy + R[8] * qz + cm[2]);
      const e = Math.hypot(ex, ey, ez);
      err += e;
      if (e > maxErr) maxErr = e;
    }
    return {
      nan,
      inverted,
      minJ,
      maxJ,
      volumeRatio: this._volume(x) / this.restVolume,
      maxStretch,
      minStretch,
      meanShapeErr: err / this.N,
      maxShapeErr: maxErr,
      ke: this.stats.ke,
      contacts: this.contacts,
    };
  }
}
