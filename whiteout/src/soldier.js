// Skinned soldier on a Mixamo rig: idle/walk/run clips drive the body, the hips turn toward travel while the
// spine twists back to the aim, both arms are solved onto the rifle with IK, and the ragdoll drives the bones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Humanoid, JOINT as J } from './humanoid.js';
import { F, angDiff } from './core.js';

let base = null;
export function loadSoldier(url) {
  return new Promise((res) => new GLTFLoader().load(url, (g) => { base = g; res(true); }, undefined, () => res(false)));
}
export const soldierReady = () => base !== null;

const UP = new THREE.Vector3(0, 1, 0);
const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), T = new THREE.Vector3(), M = new THREE.Vector3(), E = new THREE.Vector3();
const d0 = new THREE.Vector3(), d1 = new THREE.Vector3(), bend = new THREE.Vector3(), tmp = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const m4 = new THREE.Matrix4();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wp = (bone, out) => out.setFromMatrixPosition(bone.matrixWorld);

// Rotate a bone about its own pivot by a world-space rotation q.
function rotateWorld(bone, q) {
  bone.parent.getWorldQuaternion(q2);
  q3.copy(q2).invert().multiply(q).multiply(q2);
  bone.quaternion.premultiply(q3);
  bone.updateMatrixWorld(true);
}
// Turn bone so its child points at a world target.
function aim(bone, child, target) {
  wp(bone, A); wp(child, B);
  d0.subVectors(B, A).normalize(); d1.subVectors(target, A).normalize();
  rotateWorld(bone, q1.setFromUnitVectors(d0, d1));
}
// Two-bone IK with a pole hint for the middle joint.
function ik2(upper, lower, end, target, pole) {
  wp(upper, A); wp(lower, B); wp(end, C);
  const l1 = A.distanceTo(B), l2 = B.distanceTo(C);
  T.subVectors(target, A);
  const len = clamp(T.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  T.normalize();
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  bend.copy(pole).addScaledVector(T, -pole.dot(T)).normalize();
  M.copy(A).addScaledVector(T, x).addScaledVector(bend, h);
  E.copy(A).addScaledVector(T, len);
  const e = E.clone();
  aim(upper, lower, M); aim(lower, end, e);
}
// Rotation taking frame (up0, right0) onto (up1, right1).
function frame(up, right, out) {
  const y = tmp.copy(up).normalize(), x = new THREE.Vector3().copy(right).addScaledVector(y, -right.dot(y)).normalize();
  return out.setFromRotationMatrix(m4.makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
}

const NAMES = { hips: 'Hips', spine: 'Spine', spine2: 'Spine2', neck: 'Neck', head: 'Head', lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand', lUp: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot', rUp: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot' };
const teamMats = new Map();
function teamMat(m, team) {
  const key = m.uuid + ':' + team;
  if (!teamMats.has(key)) { const c = m.clone(); c.color.multiply(new THREE.Color(team === 1 ? 0xd6c49c : 0x60656d)); teamMats.set(key, c); } // dark kit vs khaki
  return teamMats.get(key);
}

export class SkinnedSoldier extends Humanoid {
  build(st, styleIdx) {
    const team = styleIdx >= 2 ? 1 : 0;
    this.model = SkeletonUtils.clone(base.scene);
    this.model.rotation.y = Math.PI; // the rig faces +Z; the game's forward is -Z
    this.g.add(this.model);
    this.model.traverse((o) => { if (o.isSkinnedMesh) { o.castShadow = true; o.frustumCulled = false; o.material = teamMat(o.material, team); } });
    this.b = {};
    for (const [k, n] of Object.entries(NAMES)) this.b[k] = this.model.getObjectByName('mixamorig' + n) || this.model.getObjectByName('mixamorig:' + n);
    // helmet with NVG mount and ear pro, parented to the head bone (bone space is in centimetres)
    const hm = new THREE.MeshStandardMaterial({ color: team === 1 ? 0x6e6650 : 0x2c2f33, roughness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.5 });
    const helm = new THREE.Group(); helm.scale.setScalar(100); helm.position.set(0, 12.5, 1.2);
    const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; helm.add(o); };
    part(new THREE.SphereGeometry(0.132, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hm, 0, 0, 0);
    part(new THREE.BoxGeometry(0.05, 0.035, 0.03), dark, 0, 0.07, 0.12);
    for (const sx of [-1, 1]) { part(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14).rotateZ(Math.PI / 2), dark, sx * 0.12, -0.04, 0.0); part(new THREE.BoxGeometry(0.012, 0.022, 0.13), dark, sx * 0.126, 0.025, 0.0); }
    this.b.head.add(helm);
    this.mixer = new THREE.AnimationMixer(this.model);
    this.act = {};
    for (const c of base.animations) if (['Idle', 'Walk', 'Run'].includes(c.name)) { const a = this.mixer.clipAction(c); a.play(); a.setEffectiveWeight(c.name === 'Idle' ? 1 : 0); this.act[c.name] = a; }
    this.mixer.update(Math.random() * 3);
    this.bodyYaw = null;
  }
  blend(a, w, dt) { a.setEffectiveWeight(a.getEffectiveWeight() + (w - a.getEffectiveWeight()) * Math.min(1, dt * 8)); }

  pose(st, dt, vel) {
    if (this.rag) return;
    const flags = st[5], yaw = st[3], pitch = st[4], b = this.b, speed = Math.hypot(vel[0], vel[1]);
    this.yaw = yaw;
    let moveYaw = yaw, back = false;
    if (speed > 0.4) {
      moveYaw = Math.atan2(-vel[0], -vel[1]);
      const d = angDiff(yaw, moveYaw);
      if (Math.abs(d) > 1.9) { back = true; moveYaw += Math.PI; } else if (Math.abs(d) > 1.1) moveYaw = yaw + Math.sign(d) * 1.1;
    }
    if (this.bodyYaw === null) this.bodyYaw = yaw;
    this.bodyYaw += angDiff(this.bodyYaw, moveYaw) * Math.min(1, dt * 8);
    this.g.position.set(st[0], st[1], st[2]); this.g.rotation.set(0, this.bodyYaw, 0);
    const run = speed > 3.6 || (flags & F.SPRINT), moving = speed > 0.4;
    this.blend(this.act.Idle, moving ? 0 : 1, dt); this.blend(this.act.Walk, moving && !run ? 1 : 0, dt); this.blend(this.act.Run, moving && run ? 1 : 0, dt);
    this.act.Walk.timeScale = (back ? -1 : 1) * clamp(speed / 1.6, 0.7, 1.9); this.act.Run.timeScale = clamp(speed / 5, 0.8, 1.3);
    this.mixer.update(dt);
    this.g.updateMatrixWorld(true);
    // crouch: lower the body and re-solve the legs so the feet stay planted
    this.crouch += (((flags & F.CROUCH) ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    this.model.position.y = -0.36 * this.crouch;
    const fwd = tmp.set(-Math.sin(this.bodyYaw), 0, -Math.cos(this.bodyYaw)).clone();
    if (this.crouch > 0.01) {
      const fl = wp(b.lFoot, new THREE.Vector3()), fr = wp(b.rFoot, new THREE.Vector3());
      this.g.updateMatrixWorld(true);
      fr.addScaledVector(fwd, 0.22 * this.crouch);
      const pole = fwd.clone().addScaledVector(UP, -0.2);
      ik2(b.lUp, b.lLeg, b.lFoot, fl, pole); ik2(b.rUp, b.rLeg, b.rFoot, fr, pole);
    } else this.g.updateMatrixWorld(true);
    // spine twists back toward the aim; chest and head pitch with it
    const twist = angDiff(this.bodyYaw, yaw), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    q1.setFromAxisAngle(UP, twist * 0.5); rotateWorld(b.spine, q1.clone()); rotateWorld(b.spine2, q1.setFromAxisAngle(UP, twist * 0.5));
    rotateWorld(b.spine2, q1.setFromAxisAngle(right, pitch * 0.55));
    rotateWorld(b.neck, q1.setFromAxisAngle(right, pitch * 0.35));
    // rifle shouldered on the right, along the aim line (low ready when sprinting or reloading)
    const ap = pitch - (run ? 0.75 : 0) - ((flags & F.RELOAD) ? 0.4 : 0), c = Math.cos(yaw), s = Math.sin(yaw);
    const ax = run ? -0.35 : 0, ay = Math.sin(ap), az = -Math.cos(ap);
    const aimDir = new THREE.Vector3(c * ax + s * az, ay, -s * ax + c * az).normalize();
    const vz = aimDir.clone().negate(), vx = new THREE.Vector3().crossVectors(UP, vz).normalize(), vy = new THREE.Vector3().crossVectors(vz, vx);
    const stock = wp(b.rArm, new THREE.Vector3()).addScaledVector(aimDir, 0.05).addScaledVector(UP, -0.04).addScaledVector(right, -0.06);
    const origin = stock.addScaledVector(aimDir, 0.347);
    this.rifle.matrixAutoUpdate = false;
    this.rifle.matrix.makeBasis(vx, vy, vz).setPosition(origin);
    this.rifle.matrixWorldNeedsUpdate = true;
    const grip = origin.clone().addScaledVector(vy, -0.08).addScaledVector(vz, 0.095);
    const fore = origin.clone().addScaledVector(vy, -0.03).addScaledVector(vz, -0.3).addScaledVector(vx, -0.02);
    ik2(b.rArm, b.rFore, b.rHand, grip, right.clone().addScaledVector(UP, -1).addScaledVector(aimDir, -0.3));
    ik2(b.lArm, b.lFore, b.lHand, fore, right.clone().negate().addScaledVector(UP, -1));
    this.fill();
  }
  fill() {
    const b = this.b, j = this.j;
    for (const [i, k] of [[J.HEAD, 'head'], [J.NECK, 'neck'], [J.PEL, 'hips'], [J.SHL, 'lArm'], [J.SHR, 'rArm'], [J.ELL, 'lFore'], [J.ELR, 'rFore'], [J.HAL, 'lHand'], [J.HAR, 'rHand'],
      [J.HPL, 'lUp'], [J.HPR, 'rUp'], [J.KNL, 'lLeg'], [J.KNR, 'rLeg'], [J.FTL, 'lFoot'], [J.FTR, 'rFoot']]) wp(b[k], j[i]);
  }
  // Ragdoll: put the bones where the verlet joints are.
  apply() {
    if (!this.rag) return;
    const b = this.b, j = this.j;
    b.hips.position.copy(b.hips.parent.worldToLocal(A.copy(j[J.PEL])));
    b.hips.updateMatrixWorld(true);
    const curUp = wp(b.neck, new THREE.Vector3()).sub(wp(b.hips, new THREE.Vector3())), curRight = wp(b.rUp, new THREE.Vector3()).sub(wp(b.lUp, new THREE.Vector3()));
    frame(curUp, curRight, qa); frame(B.subVectors(j[J.NECK], j[J.PEL]), C.subVectors(j[J.HPR], j[J.HPL]), qb);
    rotateWorld(b.hips, qb.multiply(qa.invert()));
    aim(b.neck, b.head, j[J.HEAD]);
    aim(b.lArm, b.lFore, j[J.ELL]); aim(b.lFore, b.lHand, j[J.HAL]);
    aim(b.rArm, b.rFore, j[J.ELR]); aim(b.rFore, b.rHand, j[J.HAR]);
    aim(b.lUp, b.lLeg, j[J.KNL]); aim(b.lLeg, b.lFoot, j[J.FTL]);
    aim(b.rUp, b.rLeg, j[J.KNR]); aim(b.rLeg, b.rFoot, j[J.FTR]);
  }
  dispose() { this.mixer.stopAllAction(); super.dispose(); }
}
