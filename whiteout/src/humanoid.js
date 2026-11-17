// Soldier model: limb segments placed between 15 joints. Joints come from IK poses while alive and
// from a verlet ragdoll after death, so the same meshes serve both.
import * as THREE from 'three';
import { F } from './core.js';

const HEAD = 0, NECK = 1, PEL = 2, SHL = 3, SHR = 4, ELL = 5, ELR = 6, HAL = 7, HAR = 8, HPL = 9, HPR = 10, KNL = 11, KNR = 12, FTL = 13, FTR = 14, NJ = 15;
const LIMBS = [[SHL, ELL, 0.29, 0.058, 0.05], [SHR, ELR, 0.29, 0.058, 0.05], [ELL, HAL, 0.27, 0.05, 0.042], [ELR, HAR, 0.27, 0.05, 0.042],
  [HPL, KNL, 0.45, 0.085, 0.066], [HPR, KNR, 0.45, 0.085, 0.066], [KNL, FTL, 0.44, 0.064, 0.05], [KNR, FTR, 0.44, 0.064, 0.05]];
const CONSTRAINTS = [[NECK, HEAD], [NECK, SHL], [NECK, SHR], [SHL, SHR], [SHL, ELL], [ELL, HAL], [SHR, ELR], [ELR, HAR], [NECK, PEL], [PEL, HPL], [PEL, HPR], [HPL, HPR],
  [HPL, KNL], [KNL, FTL], [HPR, KNR], [KNR, FTR], [SHL, HPL], [SHR, HPR], [SHL, HPR], [SHR, HPL], [HEAD, SHL], [HEAD, SHR], [SHL, PEL], [SHR, PEL]];
const SOFT = [[HPL, FTL, 0.42], [HPR, FTR, 0.42], [SHL, HAL, 0.2], [SHR, HAR, 0.2], [HEAD, PEL, 0.55]];

// Two looks per team: team 0 wears black kit with coyote plate carriers, team 1 olive and tan.
export const STYLES = [
  { coat: 0x3b3e43, pants: 0x45484d, helm: 0x34373b, vest: 0x7a6f57 },
  { coat: 0x43464b, pants: 0x393c41, helm: 0x3c3f44, vest: 0x6b6553, beanie: 0x2b2d31 },
  { coat: 0x59583f, pants: 0x4a4936, helm: 0x5d5b46, vest: 0x3c3e30 },
  { coat: 0x6c614a, pants: 0x585141, helm: 0x6c614a, vest: 0x46412f, beanie: 0x4b4636 },
];

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), vx = new THREE.Vector3(), vy = new THREE.Vector3(), vz = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const parts = [
    new THREE.BoxGeometry(0.05, 0.07, 0.34).translate(0, 0, 0.0), new THREE.BoxGeometry(0.055, 0.06, 0.26).translate(0, 0.005, -0.28),
    new THREE.CylinderGeometry(0.011, 0.011, 0.26, 8).rotateX(Math.PI / 2).translate(0, 0.01, -0.53), new THREE.BoxGeometry(0.03, 0.15, 0.06).rotateX(0.25).translate(0, -0.1, -0.08),
    new THREE.BoxGeometry(0.04, 0.09, 0.24).translate(0, -0.02, 0.27), new THREE.BoxGeometry(0.03, 0.045, 0.07).translate(0, 0.06, -0.02),
    new THREE.BoxGeometry(0.028, 0.09, 0.04).rotateX(-0.3).translate(0, -0.07, 0.07),
  ].map((g) => g.toNonIndexed());
  shared = {
    limb: LIMBS.map(([, , len, r0, r1]) => new THREE.CylinderGeometry(r1, r0, len, 9)),
    torso: new THREE.BoxGeometry(0.42, 0.52, 0.25),
    vest: new THREE.BoxGeometry(0.37, 0.32, 0.07),
    pouch: new THREE.BoxGeometry(0.08, 0.1, 0.05),
    hips: new THREE.BoxGeometry(0.36, 0.2, 0.24),
    head: new THREE.SphereGeometry(0.105, 14, 10),
    helm: new THREE.SphereGeometry(0.128, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    goggle: new THREE.BoxGeometry(0.17, 0.05, 0.06),
    joint: new THREE.SphereGeometry(1, 8, 6),
    hand: new THREE.BoxGeometry(0.08, 0.1, 0.05),
    boot: new THREE.BoxGeometry(0.11, 0.11, 0.28),
    rifle: mergeAll(parts),
    gun: std({ color: 0x1b1c1e, roughness: 0.45, metalness: 0.7 }),
    glove: std({ color: 0x151517, roughness: 0.8 }),
    face: std({ color: 0x1d1e20, roughness: 0.95 }),
    lens: std({ color: 0x0c1418, roughness: 0.15, metalness: 0.6, envMapIntensity: 2 }),
    boots: std({ color: 0x1a1714, roughness: 0.7 }),
    mats: new Map(),
  };
  return shared;
}
function mergeAll(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
const mat = (hex) => {
  const s = sharedAssets();
  if (!s.mats.has(hex)) s.mats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.88 }));
  return s.mats.get(hex);
};

// Two-bone IK: elbow/knee from root a, target t and a pole hint.
function ik(a, t, l1, l2, pole, mid, end) {
  v1.subVectors(t, a);
  const len = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, v1.length()));
  v1.normalize();
  end.copy(a).addScaledVector(v1, len);
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  v2.copy(pole).addScaledVector(v1, -pole.dot(v1)).normalize();
  mid.copy(a).addScaledVector(v1, x).addScaledVector(v2, h);
}
function place(m, a, b, right) {
  vy.subVectors(b, a);
  const l = vy.length();
  if (l < 1e-6) vy.set(0, 1, 0); else vy.divideScalar(l);
  vx.copy(right).addScaledVector(vy, -right.dot(vy));
  if (vx.lengthSq() < 1e-8) vx.set(1, 0, 0);
  vx.normalize(); vz.crossVectors(vx, vy);
  m.matrix.makeBasis(vx, vy, vz).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.matrixWorldNeedsUpdate = true;
}

export class Humanoid {
  constructor(scene, styleIdx, accent) {
    const S = sharedAssets(), st = STYLES[styleIdx % STYLES.length];
    this.scene = scene; this.g = new THREE.Group(); scene.add(this.g);
    this.j = Array.from({ length: NJ }, () => new THREE.Vector3());
    this.L = Array.from({ length: NJ }, () => new THREE.Vector3());
    const mk = (geo, m, cast = true) => { const x = new THREE.Mesh(geo, m); x.matrixAutoUpdate = false; x.castShadow = cast; this.g.add(x); return x; };
    this.limbs = LIMBS.map((l, i) => mk(S.limb[i], mat(i < 4 ? st.coat : st.pants)));
    this.torso = mk(S.torso, mat(st.coat));
    const vest = new THREE.Mesh(S.vest, mat(st.vest)); vest.position.set(0, 0.04, -0.15); this.torso.add(vest);
    for (const px of [-0.11, 0, 0.11]) { const p = new THREE.Mesh(S.pouch, mat(st.vest)); p.position.set(px, -0.04, -0.2); this.torso.add(p); }
    const pack = new THREE.Mesh(S.vest, mat(st.vest)); pack.scale.set(0.85, 1.2, 2.2); pack.position.set(0, 0.03, 0.2); this.torso.add(pack);
    if (accent !== undefined) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.26), new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, emissive: accent, emissiveIntensity: 0.25 })); band.position.y = 0.18; this.torso.add(band); }
    this.hips = mk(S.hips, mat(st.pants));
    this.head = mk(S.head, S.face);
    const helm = new THREE.Mesh(S.helm, mat(st.beanie || st.helm)); helm.position.y = 0.012; if (st.beanie) helm.scale.set(0.9, 1.1, 0.95); this.head.add(helm);
    if (!st.beanie) { const gg = new THREE.Mesh(S.goggle, S.lens); gg.position.set(0, 0.035, -0.085); this.head.add(gg); }
    this.joints = [ELL, ELR, KNL, KNR, SHL, SHR].map((k, i) => { const m = mk(S.joint, mat(i < 2 || i > 3 ? st.coat : st.pants), false); m.userData.k = k; m.userData.r = i > 3 ? 0.075 : 0.062; return m; });
    this.hands = [mk(S.hand, S.glove), mk(S.hand, S.glove)];
    this.boots = [mk(S.boot, S.boots), mk(S.boot, S.boots)];
    this.rifle = new THREE.Mesh(S.rifle, S.gun); this.rifle.castShadow = true; scene.add(this.rifle);
    this.flash = null;
    this.phase = Math.random() * 6; this.crouch = 0; this.rag = null; this.yaw = 0; this.dropVel = new THREE.Vector3(); this.dropSpin = new THREE.Vector3();
  }

  // st = [x,y,z,yaw,pitch,flags]; vel = world velocity [vx,vz] used for gait.
  pose(st, dt, vel) {
    if (this.rag) return;
    const L = this.L, flags = st[5], yaw = st[3], pitch = st[4];
    this.yaw = yaw;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const speed = Math.hypot(vel[0], vel[1]), run = speed > 4.2 || (flags & F.SPRINT);
    const mlx = speed > 0.2 ? (c * vel[0] - s * vel[1]) / speed : 0, mlz = speed > 0.2 ? (s * vel[0] + c * vel[1]) / speed : 0;
    this.crouch += (((flags & F.CROUCH) ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const cr = this.crouch, sp = Math.min(1, speed / 5), air = (flags & (F.AIR | F.VAULT)) ? 1 : 0;
    this.phase += speed * dt * Math.PI * 2 / (run ? 2.2 : 1.5);
    const ph = this.phase, bob = Math.abs(Math.sin(ph)) * 0.035 * sp;
    const lean = 0.06 + cr * 0.3 + sp * (run ? 0.24 : 0.07) + air * 0.15;
    L[PEL].set(0, 0.96 - cr * 0.36 + bob - sp * 0.03 - air * 0.1, 0);
    L[NECK].set(0, Math.cos(lean) * 0.52, -Math.sin(lean) * 0.52).add(L[PEL]);
    const hp = lean * 0.6 - pitch * 0.7;
    L[HEAD].set(0, Math.cos(hp) * 0.17, -Math.sin(hp) * 0.17).add(L[NECK]);
    L[SHL].set(-0.2, -0.05, 0.02).add(L[NECK]); L[SHR].set(0.2, -0.05, 0.02).add(L[NECK]);
    const ap = pitch - (run ? 0.8 : 0) - ((flags & F.RELOAD) ? 0.45 : 0);
    const ax = run ? -0.35 : 0, ay = Math.sin(ap), az = -Math.cos(ap);
    const stock = v2.set(-0.06, -0.02, -0.05).add(L[SHR]).clone();
    const grip = stock.clone().add(new THREE.Vector3(ax * 0.2, ay * 0.2 - 0.07, az * 0.2));
    const fore = stock.clone().add(new THREE.Vector3(ax * 0.46 - 0.03, ay * 0.46 - 0.035, az * 0.46));
    ik(L[SHR], grip, 0.29, 0.27, new THREE.Vector3(0.6, -1, 0.3), L[ELR], L[HAR]);
    ik(L[SHL], fore, 0.29, 0.27, new THREE.Vector3(-0.7, -1, 0), L[ELL], L[HAL]);
    L[HPL].set(-0.1, -0.04, 0).add(L[PEL]); L[HPR].set(0.1, -0.04, 0).add(L[PEL]);
    const stride = (run ? 0.42 : 0.3) * sp, lift = (run ? 0.2 : 0.11) * sp;
    const fl = new THREE.Vector3(-0.12 - cr * 0.02, 0.08, -cr * 0.3), fr = new THREE.Vector3(0.12, 0.08 + cr * 0.0, cr * 0.26);
    fl.x += mlx * Math.sin(ph) * stride; fl.z += mlz * Math.sin(ph) * stride; fl.y += Math.max(0, Math.cos(ph)) * lift + air * 0.25;
    fr.x -= mlx * Math.sin(ph) * stride; fr.z -= mlz * Math.sin(ph) * stride; fr.y += Math.max(0, -Math.cos(ph)) * lift + air * 0.18;
    const kneePole = new THREE.Vector3(mlx * 0.3, 0, -1 + mlz * 0.3);
    ik(L[HPL], fl, 0.45, 0.44, kneePole, L[KNL], L[FTL]);
    ik(L[HPR], fr, 0.45, 0.44, cr > 0.5 ? new THREE.Vector3(0, -0.6, -1) : kneePole, L[KNR], L[FTR]);
    for (let i = 0; i < NJ; i++) { const p = L[i]; this.j[i].set(st[0] + c * p.x + s * p.z, st[1] + p.y, st[2] - s * p.x + c * p.z); }
    // rifle along the aim line
    const aim = new THREE.Vector3(c * ax + s * az, ay, -s * ax + c * az).normalize();
    vz.copy(aim).negate(); vx.crossVectors(UP, vz).normalize(); vy.crossVectors(vz, vx);
    this.rifle.matrixAutoUpdate = false;
    this.rifle.matrix.makeBasis(vx, vy, vz).setPosition(this.j[HAR]);
    this.rifle.matrixWorldNeedsUpdate = true;
    this.apply();
  }

  apply() {
    const j = this.j, right = v1.subVectors(j[SHR], j[SHL]).clone(), hipR = v2.subVectors(j[HPR], j[HPL]).clone();
    LIMBS.forEach(([a, b], i) => place(this.limbs[i], j[a], j[b], i < 4 ? right : hipR));
    place(this.torso, j[PEL], j[NECK], right);
    const hipTop = j[PEL].clone().lerp(j[NECK], 0.12);
    place(this.hips, j[PEL].clone().lerp(j[NECK], -0.08), hipTop, hipR);
    place(this.head, j[NECK].clone().lerp(j[HEAD], 0.0), j[HEAD].clone().multiplyScalar(2).sub(j[NECK]), right);
    this.head.matrix.setPosition(j[HEAD]);
    for (const m of this.joints) { m.matrix.makeScale(m.userData.r, m.userData.r, m.userData.r).setPosition(j[m.userData.k]); m.matrixWorldNeedsUpdate = true; }
    place(this.hands[0], j[ELL], j[HAL], right); this.hands[0].matrix.setPosition(j[HAL]);
    place(this.hands[1], j[ELR], j[HAR], right); this.hands[1].matrix.setPosition(j[HAR]);
    // boots point along the body's facing
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    if (this.rag) fwd.subVectors(j[KNL], j[HPL]).setY(0).normalize();
    [FTL, FTR].forEach((k, i) => {
      const b = this.boots[i], p = j[k];
      vz.copy(fwd).negate(); vx.crossVectors(UP, vz).normalize(); vy.crossVectors(vz, vx);
      b.matrix.makeBasis(vx, vy, vz).setPosition(p.x + fwd.x * 0.06, Math.max(0.055, p.y - 0.02), p.z + fwd.z * 0.06);
      b.matrixWorldNeedsUpdate = true;
    });
  }

  muzzle(out) { return out.set(0, 0.01, -0.68).applyMatrix4(this.rifle.matrix); }
  headPos(out) { return out.copy(this.j[HEAD]); }
  chestPos(out) { return out.copy(this.j[NECK]).lerp(this.j[PEL], 0.3); }

  kill(dir, zone, vel) {
    const P = this.j.map((p) => p.clone()), Q = P.map((p) => p.clone()), dt = 1 / 60;
    const d = new THREE.Vector3(dir[0], 0.15, dir[1]).normalize();
    const hit = zone === 0 ? [HEAD, NECK] : zone === 1 || zone === 3 ? [NECK, SHL, SHR] : zone === 2 ? [PEL, HPL, HPR] : [KNL, KNR, PEL];
    P.forEach((p, i) => {
      const v = new THREE.Vector3(vel[0], 0, vel[1]).addScaledVector(d, hit.includes(i) ? 4.2 : 1.4);
      Q[i].addScaledVector(v, -dt);
    });
    this.rag = { P, Q, rest: CONSTRAINTS.map(([a, b]) => P[a].distanceTo(P[b])), acc: 0, t: 0 };
    this.dropVel.set(vel[0] + d.x * 1.5, 1.2, vel[1] + d.z * 1.5);
    this.dropSpin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 8);
    this.rifle.matrix.decompose(this.rifle.position, this.rifle.quaternion, this.rifle.scale);
    this.rifle.matrixAutoUpdate = true; this.dropping = true;
  }

  update(dt, world) {
    const r = this.rag;
    if (!r) return;
    r.t += dt;
    if (r.t < 6) {
      r.acc += Math.min(dt, 0.05);
      while (r.acc >= 1 / 60) { r.acc -= 1 / 60; this.step(world); }
      for (let i = 0; i < NJ; i++) this.j[i].copy(r.P[i]);
      this.apply();
    }
    if (this.dropping) { // dropped rifle
      this.dropVel.y -= 9.8 * dt;
      this.rifle.position.addScaledVector(this.dropVel, dt);
      const floor = world.floorAt(this.rifle.position.x, this.rifle.position.z, 0.05, this.rifle.position.y + 0.2) + 0.035;
      if (this.rifle.position.y < floor) {
        this.rifle.position.y = floor; this.dropping = false;
        const e = new THREE.Euler().setFromQuaternion(this.rifle.quaternion, 'YXZ'); e.x = 0; e.z = Math.PI / 2; this.rifle.quaternion.setFromEuler(e);
      } else this.rifle.rotation.set(this.rifle.rotation.x + this.dropSpin.x * dt, this.rifle.rotation.y + this.dropSpin.y * dt, this.rifle.rotation.z + this.dropSpin.z * dt);
    }
  }

  step(world) {
    const { P, Q, rest } = this.rag, g = 9.8 / 3600;
    for (let i = 0; i < NJ; i++) {
      const p = P[i], q = Q[i];
      const vx_ = (p.x - q.x) * 0.995, vy_ = (p.y - q.y) * 0.995, vz_ = (p.z - q.z) * 0.995;
      q.copy(p); p.x += vx_; p.y += vy_ - g; p.z += vz_;
    }
    for (let it = 0; it < 6; it++) {
      CONSTRAINTS.forEach(([a, b], k) => this.solve(P[a], P[b], rest[k], false));
      for (const [a, b, m] of SOFT) this.solve(P[a], P[b], m, true);
      for (let i = 0; i < NJ; i++) this.collide(world, P[i], Q[i], i === HEAD ? 0.11 : 0.07);
    }
  }
  solve(a, b, len, minOnly) {
    v1.subVectors(b, a);
    const d = v1.length() || 1e-6;
    if (minOnly && d >= len) return;
    v1.multiplyScalar((d - len) / d * 0.5);
    a.add(v1); b.sub(v1);
  }
  collide(world, p, q, r) {
    if (p.y < r) { p.y = r; q.x = p.x - (p.x - q.x) * 0.6; q.z = p.z - (p.z - q.z) * 0.6; }
    for (const b of world.boxes) {
      if (p.x < b.min[0] - r || p.x > b.max[0] + r || p.y < b.min[1] - r || p.y > b.max[1] + r || p.z < b.min[2] - r || p.z > b.max[2] + r) continue;
      const pen = [p.x - (b.min[0] - r), b.max[0] + r - p.x, p.y - (b.min[1] - r), b.max[1] + r - p.y, p.z - (b.min[2] - r), b.max[2] + r - p.z];
      let k = 0; for (let i = 1; i < 6; i++) if (pen[i] < pen[k]) k = i;
      if (k === 0) p.x = b.min[0] - r; else if (k === 1) p.x = b.max[0] + r; else if (k === 2) p.y = b.min[1] - r;
      else if (k === 3) { p.y = b.max[1] + r; q.x = p.x - (p.x - q.x) * 0.6; q.z = p.z - (p.z - q.z) * 0.6; }
      else if (k === 4) p.z = b.min[2] - r; else p.z = b.max[2] + r;
    }
  }

  revive() { this.rag = null; this.dropping = false; this.rifle.matrixAutoUpdate = false; }
  setVisible(v) { this.g.visible = v; this.rifle.visible = v; }
  dispose() { this.scene.remove(this.g); this.scene.remove(this.rifle); }
}
