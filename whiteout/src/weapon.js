// First-person assault rifle: model, arms, recoil springs, ADS, reload timeline, ejected brass.
import * as THREE from 'three';
import * as T from './textures.js';

export const RIFLE = { name: 'AR-17', cal: '5.56', interval: 0.08, mag: 30, reserve: 120, reload: 2.1, reloadEmpty: 2.7 };

class Spring {
  constructor(k, c) { this.k = k; this.c = c; this.x = 0; this.v = 0; }
  step(dt, target = 0) { // sub-stepped: stiff springs blow up on long frames otherwise
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - target) - this.c * this.v) * h; this.x += this.v * h; }
    return this.x;
  }
}
const smooth = (a, b, t) => { const k = Math.min(1, Math.max(0, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
const UPV = new THREE.Vector3(0, 1, 0);

export class Rifle {
  constructor(vmScene, scene, world) {
    this.scene = scene; this.world = world;
    const std = (o) => new THREE.MeshStandardMaterial(o);
    const metal = std({ color: 0x232427, roughness: 0.42, metalness: 0.6 });
    const poly = std({ color: 0x17181a, roughness: 0.72, metalness: 0.05 });
    const fde = std({ color: 0x7a6a50, roughness: 0.74, metalness: 0.05 });
    const steel = std({ color: 0xa3a6aa, roughness: 0.25, metalness: 0.95 });
    const sleeve = std({ color: 0x3a3c36, roughness: 0.93 });
    const skin = std({ color: 0x9a6a4f, roughness: 0.6 });
    const glove = std({ color: 0x141416, roughness: 0.78 });
    const lens = std({ color: 0x9ec4ff, transparent: true, opacity: 0.16, roughness: 0.12, metalness: 0.9, envMapIntensity: 3, depthWrite: false });

    this.root = new THREE.Group(); vmScene.add(this.root);
    this.gun = new THREE.Group(); this.root.add(this.gun);
    const add = (parent, geo, m, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); parent.add(o); return o; };
    const box = (p, m, w, h, d, x, y, z, rx, ry, rz) => add(p, new THREE.BoxGeometry(w, h, d), m, x, y, z, rx, ry, rz);
    const cylZ = (p, m, r0, r1, len, x, y, z, open = false) => add(p, new THREE.CylinderGeometry(r0, r1, len, 18, 1, open), m, x, y, z, Math.PI / 2);
    const G = this.gun;
    box(G, metal, 0.044, 0.055, 0.25, 0, 0.035, -0.04);
    box(G, metal, 0.04, 0.045, 0.19, 0, -0.012, -0.02);
    box(G, metal, 0.036, 0.05, 0.075, 0, -0.045, -0.085);
    box(G, poly, 0.03, 0.095, 0.042, 0, -0.06, 0.055, -0.35);
    box(G, metal, 0.008, 0.008, 0.06, 0, -0.045, 0.015);
    cylZ(G, metal, 0.014, 0.014, 0.17, 0, 0.02, 0.17);
    box(G, poly, 0.04, 0.075, 0.13, 0, 0.0, 0.26);
    box(G, poly, 0.042, 0.1, 0.02, 0, -0.01, 0.33);
    box(G, fde, 0.05, 0.056, 0.3, 0, 0.03, -0.31);
    box(G, metal, 0.022, 0.012, 0.42, 0, 0.064, -0.25);
    for (const s of [-1, 1]) box(G, metal, 0.008, 0.016, 0.22, s * 0.028, 0.03, -0.33);
    for (let i = 0; i < 9; i++) box(G, metal, 0.024, 0.004, 0.012, 0, 0.0715, -0.44 + i * 0.045);
    cylZ(G, metal, 0.0095, 0.0095, 0.16, 0, 0.03, -0.53);
    box(G, metal, 0.025, 0.025, 0.03, 0, 0.03, -0.47);
    cylZ(G, metal, 0.014, 0.014, 0.055, 0, 0.03, -0.635);
    for (let i = 0; i < 3; i++) box(G, poly, 0.03, 0.004, 0.01, 0, 0.044, -0.62 + i * 0.015);
    box(G, metal, 0.03, 0.01, 0.03, 0, 0.065, 0.075);
    box(G, poly, 0.002, 0.02, 0.052, 0.0225, 0.035, -0.02);
    this.bolt = box(G, steel, 0.004, 0.014, 0.045, 0.0232, 0.035, -0.02);
    // Holographic sight: hooded window with a 65 MOA ring and centre dot, on the same axis (y 0.103) as the scope.
    this.holo = new THREE.Group(); G.add(this.holo);
    const H = this.holo;
    box(H, metal, 0.034, 0.014, 0.075, 0, 0.076, -0.035);
    box(H, metal, 0.03, 0.016, 0.03, 0, 0.09, -0.01);
    for (const sd of [-1, 1]) box(H, metal, 0.005, 0.036, 0.062, sd * 0.0215, 0.101, -0.04);
    box(H, metal, 0.048, 0.006, 0.062, 0, 0.121, -0.04);
    add(H, new THREE.PlaneGeometry(0.038, 0.03), lens, 0, 0.102, -0.058);
    const ret = add(H, new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({ map: holoReticle(), color: new THREE.Color(4, 0.35, 0.3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 0, 0.103, -0.0575);
    ret.renderOrder = 6;
    // 3.5x prism scope: the eyepiece shows a picture-in-picture render of the magnified view (main.js feeds it).
    this.scope = new THREE.Group(); this.scope.visible = false; G.add(this.scope);
    const SC = this.scope;
    for (const z of [-0.025, -0.09]) { box(SC, metal, 0.03, 0.014, 0.022, 0, 0.074, z); add(SC, new THREE.TorusGeometry(0.0172, 0.004, 8, 22), metal, 0, 0.103, z); }
    cylZ(SC, metal, 0.016, 0.016, 0.1, 0, 0.103, -0.055);
    cylZ(SC, metal, 0.019, 0.025, 0.036, 0, 0.103, -0.122);
    cylZ(SC, metal, 0.021, 0.021, 0.04, 0, 0.103, 0.01);
    add(SC, new THREE.CircleGeometry(0.024, 24), lens, 0, 0.103, -0.1405);
    this.pip = add(SC, new THREE.CircleGeometry(0.0195, 40), new THREE.MeshBasicMaterial({ color: 0x000000 }), 0, 0.103, 0.0305);
    const ovl = add(SC, new THREE.CircleGeometry(0.0196, 40), new THREE.MeshBasicMaterial({ map: scopeReticle(), transparent: true, depthWrite: false }), 0, 0.103, 0.031);
    ovl.renderOrder = 6;
    this.optic = 'holo';
    this.mag = new THREE.Group(); G.add(this.mag);
    [[-0.095, -0.085, 0.08], [-0.158, -0.073, 0.2], [-0.215, -0.052, 0.35]].forEach(([y, z, r]) => box(this.mag, poly, 0.026, 0.07, 0.062, 0, y, z, r));
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.03, -0.67); G.add(this.muzzle);
    this.port = new THREE.Object3D(); this.port.position.set(0.03, 0.035, -0.02); G.add(this.port);

    // gloved arms
    const limb = (p, a, b, r0, r1, m) => {
      const d = new THREE.Vector3().subVectors(b, a), len = d.length();
      const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 14), m);
      o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UPV, d.normalize()); p.add(o); return o;
    };
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    this.armR = new THREE.Group(); G.add(this.armR);
    box(this.armR, glove, 0.05, 0.085, 0.1, 0.004, -0.068, 0.062, -0.35);
    box(this.armR, glove, 0.018, 0.05, 0.03, -0.024, -0.035, 0.03, -0.2);
    limb(this.armR, V(0.014, -0.1, 0.1), V(0.15, -0.25, 0.36), 0.041, 0.05, skin);
    limb(this.armR, V(0.014, -0.1, 0.1), V(0.03, -0.118, 0.125), 0.046, 0.047, glove);
    limb(this.armR, V(0.1, -0.19, 0.27), V(0.19, -0.29, 0.43), 0.06, 0.066, sleeve);
    this.armL = new THREE.Group(); G.add(this.armL);
    box(this.armL, glove, 0.052, 0.04, 0.105, -0.016, -0.004, -0.33);
    box(this.armL, glove, 0.016, 0.05, 0.09, -0.032, 0.028, -0.33, 0, 0, -0.2);
    box(this.armL, glove, 0.03, 0.02, 0.08, 0.018, -0.022, -0.335);
    limb(this.armL, V(-0.035, -0.03, -0.29), V(-0.21, -0.2, -0.06), 0.041, 0.05, skin);
    limb(this.armL, V(-0.035, -0.03, -0.29), V(-0.05, -0.045, -0.268), 0.046, 0.047, glove);
    limb(this.armL, V(-0.16, -0.15, -0.125), V(-0.26, -0.25, 0.0), 0.06, 0.066, sleeve);
    // wristwatch, face turned toward the shooter's eye
    const wr = V(-0.035, -0.03, -0.29), axis = V(-0.21, -0.2, -0.06).sub(wr).normalize(), wp = wr.clone().addScaledVector(axis, 0.035);
    const toEye = V(-0.07, 0.14, 0.27).sub(wp), nrm = toEye.addScaledVector(axis, -toEye.dot(axis)).normalize();
    const caseM = std({ color: 0x18191b, roughness: 0.35, metalness: 0.6 });
    const wcase = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.011, 24), caseM);
    wcase.position.copy(wp).addScaledVector(nrm, 0.047); wcase.quaternion.setFromUnitVectors(UPV, nrm); this.armL.add(wcase);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.0158, 32), new THREE.MeshStandardMaterial({ map: watchFace(), roughness: 0.25, metalness: 0.2 }));
    dial.position.copy(wp).addScaledVector(nrm, 0.0532); dial.quaternion.setFromUnitVectors(V(0, 0, 1), nrm); this.armL.add(dial);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0065, 6, 28), std({ color: 0x111112, roughness: 0.8 }));
    strap.position.copy(wp); strap.quaternion.setFromUnitVectors(V(0, 0, 1), axis); strap.scale.set(1, 1, 1.8); this.armL.add(strap);
    this.armL.userData.rest = this.armL.position.clone();

    // muzzle flash: a camera-facing star plus two plume planes along the barrel
    const fm = new THREE.MeshBasicMaterial({ map: T.flashTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(3, 2.4, 1.6), side: THREE.DoubleSide });
    this.flash = new THREE.Group(); this.muzzle.add(this.flash);
    add(this.flash, new THREE.PlaneGeometry(0.16, 0.16), fm, 0, 0, 0);
    add(this.flash, new THREE.PlaneGeometry(0.1, 0.26), fm, 0, 0, -0.1, Math.PI / 2, 0, 0);
    add(this.flash, new THREE.PlaneGeometry(0.1, 0.26), fm, 0, 0, -0.1, Math.PI / 2, Math.PI / 2, 0);
    this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 1.6, 2); this.flashLight.position.set(0, 0.03, -0.55); this.gun.add(this.flashLight);

    vmScene.add(new THREE.HemisphereLight(0xbcd4f2, 0x9a948c, 1.1));
    this.sun = new THREE.DirectionalLight(0xfff1de, 2.6); this.sun.position.set(0.4, 1, 0.3); vmScene.add(this.sun, this.sun.target); // main.js aims it at the real sun

    this.kz = new Spring(900, 38); this.krx = new Spring(700, 30); this.kry = new Spring(600, 28); this.krz = new Spring(500, 22);
    this.swx = new Spring(120, 16); this.swy = new Spring(120, 16); this.land = new Spring(260, 18);
    this.ads = 0; this.sprint = 0; this.phase = 0; this.t = 0; this.flashT = 0; this.boltT = 1; this.vault = 0;
    this.ammo = RIFLE.mag; this.reserve = RIFLE.reserve; this.reloadT = -1; this.reloadDur = 0; this.reloadEmpty = false; this.cool = 0;
    this.onEvent = () => {};
    this.casings = new Casings(scene, world, (p, soft) => this.onEvent(soft ? 'clinkSoft' : 'clink', p));
  }

  get reloading() { return this.reloadT >= 0; }
  setOptic(o) { this.optic = o; this.holo.visible = o === 'holo'; this.scope.visible = o === 'scope'; }
  reset() { this.ammo = RIFLE.mag; this.reserve = RIFLE.reserve; this.reloadT = -1; this.mag.position.set(0, 0, 0); this.armL.position.copy(this.armL.userData.rest); }
  startReload() {
    if (this.reloading || this.ammo >= RIFLE.mag || this.reserve <= 0) return false;
    this.reloadEmpty = this.ammo === 0; this.reloadDur = this.reloadEmpty ? RIFLE.reloadEmpty : RIFLE.reload; this.reloadT = 0; this.evs = new Set();
    return true;
  }
  canFire() { return !this.reloading && this.ammo > 0 && this.cool <= 0 && this.sprint < 0.35 && this.vault < 0.2; }
  fire(ads) {
    this.ammo--; this.cool += RIFLE.interval;
    const a = ads > 0.5 ? 0.55 : 1;
    this.kz.v += 1.5 * a + Math.random() * 0.3; this.krx.v += (2.6 + Math.random() * 0.8) * a;
    this.kry.v += (Math.random() - 0.5) * 1.4 * a; this.krz.v += (Math.random() - 0.5) * 2.4 * a;
    this.flashT = 0.04; this.boltT = 0;
    this.flash.rotation.z = Math.random() * Math.PI; this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  // s: {ads, sprint, speed01, look:[dx,dy], vault01, landed, dt}
  update(dt, s, worldFov) {
    this.t += dt; this.cool = Math.max(-0.02, this.cool - dt);
    this.ads += ((s.ads && !this.reloading && !s.sprint && s.vault < 0.1 ? 1 : 0) - this.ads) * Math.min(1, dt * 13);
    this.sprint += ((s.sprint && !this.reloading ? 1 : 0) - this.sprint) * Math.min(1, dt * 9);
    this.vault += (s.vault - this.vault) * Math.min(1, dt * 14);
    if (s.landed) this.land.v -= Math.min(1.2, s.landed * 0.12);
    const k = 1 - this.ads * 0.85, sp = s.speed01;
    this.phase += dt * sp * (s.sprint ? 10.5 : 7.8);
    this.swx.v += -s.look[0] * 0.00045 * (1 - this.ads * 0.6); this.swy.v += -s.look[1] * 0.00045 * (1 - this.ads * 0.6);
    const kz = this.kz.step(dt), krx = this.krx.step(dt), kry = this.kry.step(dt), krz = this.krz.step(dt);
    const swx = this.swx.step(dt), swy = this.swy.step(dt), land = this.land.step(dt);
    const hip = [0.135, -0.17, -0.315], aim = [0, -0.103, -0.225], a = this.ads;
    const bx = Math.sin(this.phase) * 0.012 * sp * k, by = -Math.abs(Math.cos(this.phase)) * 0.01 * sp * k;
    const br = Math.sin(this.t * 1.6) * 0.0012 * (1 - a * 0.7);
    let px = hip[0] + (aim[0] - hip[0]) * a + bx + swx * 0.3 + this.sprint * 0.03;
    let py = hip[1] + (aim[1] - hip[1]) * a + by + br + land * 0.6 - this.sprint * 0.035 - this.vault * 0.09;
    let pz = hip[2] + (aim[2] - hip[2]) * a + kz * 0.025 + this.sprint * 0.03;
    let rx = krx * 0.06 + swy + this.sprint * -0.42 - this.vault * 0.35 + Math.sin(this.t * 1.2) * 0.002;
    let ry = kry * 0.05 + swx + this.sprint * 0.7;
    let rz = krz * 0.05 + this.sprint * 0.22 + bx * 1.8 + this.vault * 0.55;
    if (this.reloading) {
      this.reloadT += dt;
      const t = this.reloadT / this.reloadDur, inn = smooth(0, 0.14, t) * (1 - smooth(0.86, 1, t));
      rz += -0.55 * inn; rx += 0.12 * inn - 0.06 * Math.sin(Math.PI * smooth(0.6, 0.68, t)); ry += -0.15 * inn; py += 0.025 * inn; px -= 0.03 * inn;
      const out = smooth(0.2, 0.34, t) - smooth(0.5, 0.63, t);
      this.mag.position.y = -0.32 * out; this.mag.position.z = 0.03 * out;
      const L = this.armL.position, R0 = this.armL.userData.rest;
      const toWell = smooth(0.06, 0.2, t) * (1 - smooth(0.88, 1, t)), down = out;
      L.set(R0.x + 0.02 * toWell, R0.y - 0.08 * toWell - 0.3 * down, R0.z + 0.25 * toWell);
      if (this.reloadEmpty) { const slap = Math.sin(Math.PI * smooth(0.74, 0.84, t)); L.x += 0.04 * slap; L.y += 0.11 * slap; }
      const ev = (name, at) => { if (t >= at && !this.evs.has(name)) { this.evs.add(name); this.onEvent(name); } };
      ev('magout', 0.2); ev('magin', 0.62);
      if (t >= 0.62 && !this.evs.has('fill')) { this.evs.add('fill'); const need = RIFLE.mag - this.ammo, take = Math.min(need, this.reserve); this.ammo += take; this.reserve -= take; }
      if (this.reloadEmpty) ev('bolt', 0.8);
      if (t >= 1) { this.reloadT = -1; L.copy(R0); this.mag.position.set(0, 0, 0); }
    }
    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, ry, rz, 'YXZ');
    this.boltT = Math.min(1, this.boltT + dt / 0.075);
    this.bolt.position.z = -0.02 + Math.sin(Math.PI * this.boltT) * 0.022;
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = this.flashT > 0 ? 4 : this.flashLight.intensity * 0.5;
    this.root.updateMatrixWorld(true);
  }

  // Camera-space point of a viewmodel part, rescaled so it lands on the same pixel under the world camera's FOV.
  toCamera(obj, out, worldFov, vmFov) {
    obj.getWorldPosition(out);
    const k = Math.tan(THREE.MathUtils.degToRad(worldFov) / 2) / Math.tan(THREE.MathUtils.degToRad(vmFov) / 2);
    out.x *= k; out.y *= k;
    return out;
  }
}

// Brass: pooled instances with simple bounce physics against the collision boxes.
function holoReticle() {
  const c = T.canvas(128), g = c.getContext('2d');
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 2.2;
  g.beginPath(); g.arc(64, 64, 24, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(64, 64, 2.2, 0, Math.PI * 2); g.fill();
  for (const [x, y, w, h] of [[63, 36, 2, 6], [63, 86, 2, 6], [36, 63, 6, 2], [86, 63, 6, 2]]) g.fillRect(x, y, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function scopeReticle() {
  const S = 256, c = T.canvas(S), g = c.getContext('2d'), m = S / 2;
  g.fillStyle = 'rgba(0,0,0,0.92)'; g.fillRect(m - 0.75, 0, 1.5, S); g.fillRect(0, m - 0.75, S, 1.5);
  g.fillRect(m - 3, m + 22, 6, S); g.fillRect(0, m - 3, m - 22, 6); g.fillRect(m + 22, m - 3, m, 6);
  g.strokeStyle = 'rgba(255,70,40,1)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(m - 7, m + 9); g.lineTo(m, m); g.lineTo(m + 7, m + 9); g.stroke();
  const v = g.createRadialGradient(m, m, m * 0.72, m, m, m);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.75, 'rgba(0,0,0,0.75)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function watchFace() {
  const S = 128, c = T.canvas(S), g = c.getContext('2d'), m = S / 2;
  g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(m, m, m, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8e8e8';
  for (let i = 0; i < 12; i++) { g.save(); g.translate(m, m); g.rotate(i / 12 * Math.PI * 2); g.fillRect(-2, -m + 6, 4, i % 3 ? 9 : 15); g.restore(); }
  g.strokeStyle = '#f2f2f2'; g.lineCap = 'round';
  for (const [a, len, w] of [[-0.9, 0.48, 5], [1.3, 0.7, 3.5]]) { g.lineWidth = w; g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.sin(a) * m * len, m - Math.cos(a) * m * len); g.stroke(); }
  g.strokeStyle = '#d64b2a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.sin(2.6) * m * 0.8, m - Math.cos(2.6) * m * 0.8); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

class Casings {
  constructor(scene, world, onHit) {
    const n = 64;
    this.world = world; this.onHit = onHit; this.i = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0048, 0.0058, 0.045, 8).rotateZ(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xc9a04e, metalness: 1, roughness: 0.25 }), n);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false;
    this.items = Array.from({ length: n }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), life: 0, bounces: 0, rest: false }));
    this.m = new THREE.Matrix4(); this.dq = new THREE.Quaternion(); this.zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.zero);
    scene.add(this.mesh);
  }
  spawn(p, v) {
    const c = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    c.p.copy(p); c.v.copy(v); c.q.setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0));
    c.w.set((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 50, 20 + Math.random() * 25); c.life = 9; c.bounces = 0; c.rest = false;
  }
  update(dt) {
    const S = new THREE.Vector3(1, 1, 1);
    this.items.forEach((c, i) => {
      if (c.life <= 0) return;
      c.life -= dt;
      if (c.life <= 0) { this.mesh.setMatrixAt(i, this.zero); return; }
      if (!c.rest) {
        c.v.y -= 9.8 * dt;
        c.p.addScaledVector(c.v, dt);
        const wl = c.w.length();
        if (wl > 1e-3) { this.dq.setFromAxisAngle(c.w.clone().divideScalar(wl), wl * dt); c.q.premultiply(this.dq); }
        const box = this.world.overlap(c.p.x - 0.005, c.p.y - 0.005, c.p.z - 0.005, c.p.x + 0.005, c.p.y + 0.005, c.p.z + 0.005);
        if (box && c.p.y < box.max[1] - 0.03) { // side hit: reflect the horizontal component
          const dx = Math.min(c.p.x - box.min[0], box.max[0] - c.p.x), dz = Math.min(c.p.z - box.min[2], box.max[2] - c.p.z);
          if (dx < dz) { c.p.x = c.p.x - box.min[0] < box.max[0] - c.p.x ? box.min[0] - 0.006 : box.max[0] + 0.006; c.v.x *= -0.4; }
          else { c.p.z = c.p.z - box.min[2] < box.max[2] - c.p.z ? box.min[2] - 0.006 : box.max[2] + 0.006; c.v.z *= -0.4; }
        }
        const floor = this.world.floorAt(c.p.x, c.p.z, 0.004, c.p.y + 0.02) + 0.005;
        if (c.p.y < floor) {
          c.p.y = floor;
          const soft = floor < 0.01;
          if (Math.abs(c.v.y) > 0.7 && c.bounces < 3) {
            if (c.bounces === 0 || !soft) this.onHit(c.p, soft);
            c.bounces++; c.v.y = -c.v.y * (soft ? 0.18 : 0.38); c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5);
          } else {
            c.rest = true; c.v.set(0, 0, 0);
            const e = new THREE.Euler().setFromQuaternion(c.q, 'YXZ'); c.q.setFromEuler(new THREE.Euler(0, e.y, 0));
            if (soft) c.p.y = 0.002; // settles into the snow
          }
        }
      }
      this.mesh.setMatrixAt(i, this.m.compose(c.p, c.q, S));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
