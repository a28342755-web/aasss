// Particles, decals, tracers, steam and breath vapor.
import * as THREE from 'three';
import * as T from './textures.js';
import { MAT } from './map.js';

const VERT = `attribute vec4 col; attribute float size; uniform float uScale; varying vec4 vCol;
#include <fog_pars_vertex>
void main(){ vCol = col; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / max(0.05, -mvPosition.z); gl_Position = projectionMatrix * mvPosition;
#include <fog_vertex>
}`;
const FRAG = `uniform sampler2D map; varying vec4 vCol;
#include <fog_pars_fragment>
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a);
#include <fog_fragment>
}`;

class Particles {
  constructor(scene, max, additive, map) {
    this.max = max; this.n = 0;
    this.P = new Float32Array(max * 3); this.C = new Float32Array(max * 4); this.S = new Float32Array(max);
    this.V = new Float32Array(max * 3); this.D = new Float32Array(max * 10); // life, maxLife, s0, s1, a0, grav, drag, r, g, b
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.P, 3).setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.C, 4).setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.S, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pa); g.setAttribute('col', this.ca); g.setAttribute('size', this.sa);
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uScale: { value: 600 } }]),
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.uniforms.map.value = map;
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 3;
    scene.add(this.pts);
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, grav, drag) {
    if (this.n >= this.max) return;
    const i = this.n++, d = i * 10;
    this.P.set([x, y, z], i * 3); this.V.set([vx, vy, vz], i * 3);
    this.D[d] = life; this.D[d + 1] = life; this.D[d + 2] = s0; this.D[d + 3] = s1; this.D[d + 4] = a0;
    this.D[d + 5] = grav; this.D[d + 6] = drag; this.D[d + 7] = r; this.D[d + 8] = g; this.D[d + 9] = b;
  }
  update(dt) {
    const { P, V, D, C, S } = this;
    for (let i = 0; i < this.n; i++) {
      const d = i * 10;
      D[d] -= dt;
      if (D[d] <= 0) { // swap-remove
        const j = --this.n;
        if (i !== j) { P.copyWithin(i * 3, j * 3, j * 3 + 3); V.copyWithin(i * 3, j * 3, j * 3 + 3); D.copyWithin(d, j * 10, j * 10 + 10); }
        i--; continue;
      }
      const k = Math.exp(-D[d + 6] * dt), p = i * 3;
      V[p] *= k; V[p + 1] = V[p + 1] * k - D[d + 5] * dt; V[p + 2] *= k;
      P[p] += V[p] * dt; P[p + 1] += V[p + 1] * dt; P[p + 2] += V[p + 2] * dt;
      if (P[p + 1] < 0.01 && D[d + 5] > 0) { P[p + 1] = 0.01; V[p] *= 0.5; V[p + 1] = 0; V[p + 2] *= 0.5; }
      const t = 1 - D[d] / D[d + 1];
      S[i] = D[d + 2] + (D[d + 3] - D[d + 2]) * t;
      C[i * 4] = D[d + 7]; C[i * 4 + 1] = D[d + 8]; C[i * 4 + 2] = D[d + 9]; C[i * 4 + 3] = D[d + 4] * (1 - t) * Math.min(1, t * 12 + 0.3);
    }
    this.pts.geometry.setDrawRange(0, this.n);
    this.pa.needsUpdate = this.ca.needsUpdate = this.sa.needsUpdate = true;
  }
}

class Decals {
  constructor(scene, max, tex, rough) {
    this.max = max; this.i = 0;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: rough }), max);
    this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0), white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < max; i++) { this.mesh.setMatrixAt(i, z); this.mesh.setColorAt(i, white); }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion(); this.c = new THREE.Color();
    scene.add(this.mesh);
  }
  add(p, n, size, tint) {
    const nv = new THREE.Vector3(n[0], n[1], n[2]);
    this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nv);
    this.q2.setFromAxisAngle(nv, Math.random() * Math.PI * 2); this.q.premultiply(this.q2);
    this.m.compose(new THREE.Vector3(p[0] + n[0] * 0.006, p[1] + n[1] * 0.006, p[2] + n[2] * 0.006), this.q, new THREE.Vector3(size, size, size));
    this.mesh.setMatrixAt(this.i, this.m);
    this.mesh.setColorAt(this.i, this.c.setRGB(tint[0], tint[1], tint[2]));
    this.i = (this.i + 1) % this.max;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}

export class FX {
  constructor(scene, world) {
    this.world = world;
    const dot = T.softDot();
    this.soft = new Particles(scene, 3000, false, dot);
    this.glow = new Particles(scene, 600, true, dot);
    this.holes = new Decals(scene, 160, T.bulletHole(), 0.9);
    const bt = new THREE.CanvasTexture(T.splatter(256, true)); bt.colorSpace = THREE.SRGBColorSpace;
    this.bloodDecals = new Decals(scene, 60, bt, 0.35);
    this.tracers = [];
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.3, 1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), tm); m.visible = false; scene.add(m);
      this.tracers.push({ m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, d: 0, on: false });
    }
    this.steam = [[-0.4, 0.05, 4, 0], [16.08, 0.6, -6, 1]];
    this.steamAcc = 0;
  }
  setScale(s) { this.soft.mat.uniforms.uScale.value = s; this.glow.mat.uniforms.uScale.value = s; }

  impact(p, n, mat) {
    const [x, y, z] = p, r = Math.random, sp = this.soft;
    const spray = (k, speed) => [n[0] * speed + (r() - 0.5) * k, n[1] * speed + (r() - 0.5) * k + 0.6, n[2] * speed + (r() - 0.5) * k];
    if (mat === MAT.SNOW) {
      for (let i = 0; i < 12; i++) { const v = spray(2.2, 1 + r() * 2); sp.spawn(x, y, z, v[0], v[1] + 1, v[2], 0.5 + r() * 0.6, 0.05, 0.16, 0.86, 0.89, 0.93, 0.95, 6, 2.5); }
      for (let i = 0; i < 2; i++) sp.spawn(x, y + 0.05, z, (r() - 0.5) * 0.4, 0.5, (r() - 0.5) * 0.4, 1.3, 0.25, 0.8, 0.85, 0.88, 0.92, 0.35, 0, 1.5);
      this.holes.add(p, n, 0.07, [0.55, 0.58, 0.62]);
      return;
    }
    if (mat === MAT.METAL || mat === MAT.GLASS) {
      for (let i = 0; i < 12; i++) { const v = spray(5, 2 + r() * 4); this.glow.spawn(x, y, z, v[0], v[1], v[2], 0.12 + r() * 0.25, 0.03, 0.01, 3.2, 1.9, 0.7, 1, 9.8, 1); }
      sp.spawn(x, y, z, n[0] * 0.3, 0.3, n[2] * 0.3, 0.6, 0.08, 0.3, 0.6, 0.6, 0.6, 0.3, 0, 2);
      this.holes.add(p, n, 0.06, [1.4, 1.4, 1.4]);
      return;
    }
    const col = mat === MAT.BRICK ? [0.52, 0.32, 0.25] : mat === MAT.WOOD ? [0.5, 0.38, 0.24] : [0.58, 0.57, 0.55];
    for (let i = 0; i < 6; i++) { const v = spray(1.8, 1 + r() * 2.5); sp.spawn(x, y, z, v[0], v[1], v[2], 0.6 + r() * 0.6, 0.04, 0.2, col[0], col[1], col[2], 0.8, 1.5, 3); }
    for (let i = 0; i < 5; i++) { const v = spray(3, 2 + r() * 3); sp.spawn(x, y, z, v[0], v[1], v[2], 0.6 + r() * 0.5, 0.025, 0.02, col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 1, 9.8, 0.5); }
    sp.spawn(x, y, z, n[0] * 0.4, 0.2, n[2] * 0.4, 1.4, 0.12, 0.6, col[0], col[1], col[2], 0.4, 0, 1.8);
    this.holes.add(p, n, 0.085, [1, 1, 1]);
  }

  blood(p, dir, big) {
    const [x, y, z] = p, r = Math.random, n = big ? 26 : 16;
    for (let i = 0; i < n; i++) {
      const s = 1.2 + r() * 3.5, back = r() < 0.25 ? -0.5 : 1;
      this.soft.spawn(x, y, z, dir[0] * s * back + (r() - 0.5) * 1.4, dir[1] * s * back + (r() - 0.3) * 1.4, dir[2] * s * back + (r() - 0.5) * 1.4,
        0.35 + r() * 0.5, 0.035, 0.11, 0.42 + r() * 0.18, 0.015, 0.02, 0.95, 5, 2.5);
    }
    this.soft.spawn(x, y, z, dir[0] * 0.6, 0.1, dir[2] * 0.6, 0.55, 0.2, 0.55, 0.45, 0.03, 0.03, big ? 0.55 : 0.35, 0, 3);
    // spatter on whatever is behind the target, and on the snow below
    const w = this.world.raycast(x, y, z, dir[0], dir[1], dir[2], 3.2);
    if (w && w.mat !== MAT.SNOW) this.bloodDecals.add(w.p, w.n, 0.45 + r() * 0.5, [1, 1, 1]);
    if (big || r() < 0.5) {
      const gx = x + dir[0] * (0.4 + r()), gz = z + dir[2] * (0.4 + r());
      this.bloodDecals.add([gx, this.world.floorAt(gx, gz, 0.05, y), gz], [0, 1, 0], 0.5 + r() * 0.7, [1, 1, 1]);
    }
  }

  tracer(from, to) {
    const t = this.tracers.find((q) => !q.on);
    if (!t) return;
    t.from.copy(from); t.dir.subVectors(to, from); t.dist = t.dir.length(); t.dir.divideScalar(t.dist || 1);
    t.d = Math.random() * 4; t.on = t.dist > 1.5;
  }
  smoke(p) { this.soft.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 0.2, 0.25, (Math.random() - 0.5) * 0.2, 0.9, 0.06, 0.45, 0.7, 0.7, 0.72, 0.22, 0, 1.6); }
  breath(p, dir) { this.soft.spawn(p.x + dir.x * 0.12, p.y - 0.03, p.z + dir.z * 0.12, dir.x * 0.45, 0.06, dir.z * 0.45, 1.5, 0.08, 0.45, 0.88, 0.9, 0.94, 0.16, -0.05, 1.3); }
  kick(x, z) { for (let i = 0; i < 3; i++) this.soft.spawn(x + (Math.random() - 0.5) * 0.2, 0.05, z + (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, 0.5, 0.05, 0.12, 0.88, 0.9, 0.94, 0.6, 4, 2); }

  update(dt) {
    this.steamAcc += dt;
    while (this.steamAcc > 0.07) {
      this.steamAcc -= 0.07;
      for (const [x, y, z, side] of this.steam) {
        const r = Math.random;
        this.soft.spawn(x + (r() - 0.5) * 0.4, y, z + (r() - 0.5) * 0.4, side ? 0.6 + r() * 0.3 : 0.25 + (r() - 0.5) * 0.3, 0.7 + r() * 0.5, (r() - 0.5) * 0.3, 3.2, 0.35, 2.2, 0.72, 0.75, 0.8, 0.2, -0.05, 0.6);
      }
    }
    this.soft.update(dt); this.glow.update(dt);
    for (const t of this.tracers) {
      if (!t.on) continue;
      t.d += 420 * dt;
      const len = Math.min(3, t.d, t.dist - t.d + 3);
      if (t.d - 3 > t.dist || len <= 0) { t.on = false; t.m.visible = false; continue; }
      const head = Math.min(t.d, t.dist), tail = Math.max(0, head - len);
      t.m.visible = true;
      t.m.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.m.lookAt(t.m.position.clone().add(t.dir));
      t.m.scale.set(0.014, 0.014, Math.max(0.01, head - tail));
    }
  }
}
