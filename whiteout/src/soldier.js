// Skinned soldier on a Mixamo rig: idle/walk/run clips drive the body, the hips turn toward travel while the
// spine twists back to the aim, both arms are solved onto the rifle with IK, and the ragdoll drives the bones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { Humanoid, JOINT as J } from './humanoid.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { F, angDiff } from './core.js';
import { canvas } from './textures.js';

let base = null;
// The artifact's CSP refuses fetch() of data:/blob: URLs, which is how GLTFLoader reads an embedded buffer and its
// images. So decode the buffer here and hand the loader buffer views and textures directly: nothing is fetched but the file.
export async function loadSoldier(url) {
  try {
    const text = await (await fetch(url)).text(), json = JSON.parse(text), s = atob(json.buffers[0].uri.split(',')[1]);
    const bin = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i);
    const view = (i) => { const v = json.bufferViews[i], o = v.byteOffset || 0; return bin.buffer.slice(o, o + v.byteLength); };
    const loader = new GLTFLoader().register(() => ({
      name: 'embedded',
      loadBufferView: async (i) => view(i),
      loadTexture: async (i) => {
        const img = json.images[json.textures[i].source];
        const t = new THREE.Texture(await createImageBitmap(new Blob([view(img.bufferView)], { type: img.mimeType })));
        Object.assign(t, { flipY: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, needsUpdate: true });
        return t;
      },
    }));
    base = await loader.parseAsync(text, '');
    return true;
  } catch (e) {
    console.warn('soldier model failed to load', e);
    return false;
  }
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
// The stock texture is orange-brown: desaturate it once, then tint per squad (black kit vs dark coyote, like the reference).
const greys = new Map(), teamMats = new Map();
function greyMap(t) {
  if (!t || !t.image || !t.image.width) return t;
  if (!greys.has(t)) {
    const img = t.image, c = canvas(img.width, img.height), g = c.getContext('2d');
    g.filter = 'grayscale(1) contrast(1.15)'; g.drawImage(img, 0, 0);
    const n = new THREE.CanvasTexture(c);
    Object.assign(n, { flipY: t.flipY, colorSpace: THREE.SRGBColorSpace, wrapS: t.wrapS, wrapT: t.wrapT, anisotropy: 4 });
    greys.set(t, n);
  }
  return greys.get(t);
}
function teamMat(m, team) {
  const key = m.uuid + ':' + team;
  if (!teamMats.has(key)) { const c = m.clone(); c.map = greyMap(m.map); c.color.set(team === 1 ? 0x5e5546 : 0x3a3c40); teamMats.set(key, c); }
  return teamMats.get(key);
}

// Webbing fabric for plate carriers, pouches and packs: rows of strap with stitching.
let molle = null;
function gearMats(team) {
  if (!molle) {
    const S = 256, c = canvas(S), g = c.getContext('2d');
    g.fillStyle = '#8a8a7a'; g.fillRect(0, 0, S, S);
    for (let y = 8; y < S; y += 32) {
      g.fillStyle = 'rgba(40,40,32,0.55)'; g.fillRect(0, y, S, 16);
      g.fillStyle = 'rgba(255,255,240,0.1)'; g.fillRect(0, y, S, 2);
      for (let x = 12; x < S; x += 38) { g.fillStyle = 'rgba(20,20,16,0.6)'; g.fillRect(x, y, 3, 16); }
    }
    molle = new THREE.CanvasTexture(c); molle.colorSpace = THREE.SRGBColorSpace; molle.wrapS = molle.wrapT = THREE.RepeatWrapping;
  }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const [plate, pack] = team === 1 ? [0x8a7c5c, 0x968664] : [0x5f5f45, 0x6e6c4c];
  return { plate: std({ map: molle, color: plate, roughness: 0.92 }), pouch: std({ map: molle, color: plate, roughness: 0.92 }), pack: std({ map: molle, color: pack, roughness: 0.92 }),
    roll: std({ color: team === 1 ? 0x6e6450 : 0x46463a, roughness: 0.95 }), lens: std({ color: 0x0c1014, roughness: 0.15, metalness: 0.6, envMapIntensity: 2 }) };
}

export class SkinnedSoldier extends Humanoid {
  build(st, styleIdx) {
    const team = styleIdx >= 2 ? 1 : 0;
    this.model = SkeletonUtils.clone(base.scene);
    this.g.add(this.model);
    this.model.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (o.name.includes('visor')) { o.visible = false; return; } // sci-fi visor off; goggles go on instead
      o.castShadow = true; o.frustumCulled = false; o.material = teamMat(o.material, team);
    });
    this.b = {};
    for (const [k, n] of Object.entries(NAMES)) this.b[k] = this.model.getObjectByName('mixamorig' + n) || this.model.getObjectByName('mixamorig:' + n);
    // helmet with NVG mount and ear pro, parented to the head bone (bone space is in centimetres)
    const hm = new THREE.MeshStandardMaterial({ color: team === 1 ? 0x5a5240 : 0x26282b, roughness: 0.7 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.5, metalness: 0.5 });
    const helm = new THREE.Group(); helm.scale.setScalar(100); helm.position.set(0, 12.5, 1.2);
    const part = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; helm.add(o); };
    part(new THREE.SphereGeometry(0.132, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hm, 0, 0, 0);
    part(new THREE.BoxGeometry(0.05, 0.035, 0.03), dark, 0, 0.07, 0.12);
    for (const sx of [-1, 1]) { part(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 14).rotateZ(Math.PI / 2), dark, sx * 0.12, -0.04, 0.0); part(new THREE.BoxGeometry(0.012, 0.022, 0.13), dark, sx * 0.126, 0.025, 0.0); }
    this.b.head.add(helm);
    // load-bearing kit on the chest bone (+Y up the spine, +Z forward), knee pads on the shins (front is -Z)
    const gm = gearMats(team), rb = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);
    const kit = (bone, items) => {
      const g = new THREE.Group(); g.scale.setScalar(100); bone.add(g);
      for (const [geo, m, x, y, z, rx = 0] of items) { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = true; g.add(o); }
    };
    kit(this.b.spine2, [
      [rb(0.31, 0.33, 0.06, 0.02), gm.plate, 0, 0.02, 0.13], [rb(0.31, 0.35, 0.05, 0.02), gm.plate, 0, 0.03, -0.13],
      [rb(0.39, 0.12, 0.29, 0.04), gm.plate, 0, -0.17, 0],
      [rb(0.07, 0.11, 0.05, 0.012), gm.pouch, -0.077, -0.03, 0.18], [rb(0.07, 0.11, 0.05, 0.012), gm.pouch, 0, -0.03, 0.18], [rb(0.07, 0.11, 0.05, 0.012), gm.pouch, 0.077, -0.03, 0.18],
      [rb(0.31, 0.41, 0.18, 0.04), gm.pack, 0, 0.0, -0.25], [new THREE.CylinderGeometry(0.065, 0.065, 0.3, 14).rotateZ(Math.PI / 2), gm.roll, 0, 0.24, -0.24],
      [new THREE.BoxGeometry(0.05, 0.025, 0.3), gm.plate, -0.12, 0.2, 0], [new THREE.BoxGeometry(0.05, 0.025, 0.3), gm.plate, 0.12, 0.2, 0],
      [rb(0.07, 0.13, 0.08, 0.015), gm.pouch, 0.2, -0.05, -0.12], [new THREE.CylinderGeometry(0.003, 0.003, 0.32, 4), dark, 0.21, 0.18, -0.14],
    ]);
    for (const leg of [this.b.lLeg, this.b.rLeg]) kit(leg, [[rb(0.095, 0.11, 0.05, 0.02), dark, 0, 0.035, -0.075]]);
    kit(this.b.head, [[rb(0.15, 0.042, 0.05, 0.015), gm.lens, 0, 0.085, 0.09]]);
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
    // combat stance: always low with bent knees (deeper when crouching); legs re-solved so the feet stay planted
    this.crouch += (((flags & F.CROUCH) ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const fwd = tmp.set(-Math.sin(this.bodyYaw), 0, -Math.cos(this.bodyYaw)).clone();
    const fl = wp(b.lFoot, new THREE.Vector3()), fr = wp(b.rFoot, new THREE.Vector3());
    this.model.position.y = -(0.1 + 0.33 * this.crouch);
    this.g.updateMatrixWorld(true);
    fr.addScaledVector(fwd, 0.22 * this.crouch);
    const pole = fwd.clone().addScaledVector(UP, -0.2);
    ik2(b.lUp, b.lLeg, b.lFoot, fl, pole); ik2(b.rUp, b.rLeg, b.rFoot, fr, pole);
    // hunch the torso forward, keep the head level; spine twists back toward the aim; chest and head pitch with it
    const twist = angDiff(this.bodyYaw, yaw), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), bodyRight = new THREE.Vector3(Math.cos(this.bodyYaw), 0, -Math.sin(this.bodyYaw));
    const lean = 0.22 + 0.1 * this.crouch + (run ? 0.18 : 0);
    rotateWorld(b.spine, q1.setFromAxisAngle(bodyRight, -lean));
    q1.setFromAxisAngle(UP, twist * 0.5); rotateWorld(b.spine, q1.clone()); rotateWorld(b.spine2, q1.setFromAxisAngle(UP, twist * 0.5));
    rotateWorld(b.neck, q1.setFromAxisAngle(right, lean * 0.75));
    // bladed shooting stance: left shoulder forward so the support hand reaches the handguard, head turned back to the aim
    rotateWorld(b.spine2, q1.setFromAxisAngle(UP, -0.45)); rotateWorld(b.neck, q1.setFromAxisAngle(UP, 0.45));
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
    const fore = origin.clone().addScaledVector(vy, -0.035).addScaledVector(vz, -0.21).addScaledVector(vx, -0.02);
    fore.addScaledVector(A.subVectors(fore, wp(b.lArm, B)).normalize(), -0.06); // hand bone sits at the wrist, short of the palm
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
