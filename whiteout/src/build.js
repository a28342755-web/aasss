// Builds the snowy brick alley from map data: geometry is merged per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, PROPS, LAMPS, NEON } from './map.js';
import * as T from './textures.js';

// Direction toward the low winter sun (south-west, about 38 degrees up).
export const SUN = new THREE.Vector3(-0.5, 0.62, 0.6).normalize();

const { rnd, worldUV, photo } = T;
const OPEN = [[-3.5, -64, 3.5, 38.3], [-16, 6, -3.5, 12], [-28, 0, -16, 20], [3.5, -14, 16, -8], [16, -24, 30, -2]];
const isOpen = (x, z) => OPEN.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
const Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3();
const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V.set(x, y, z).clone(), Q.setFromEuler(E.set(rx, ry, rz)).clone(), new THREE.Vector3(sx, sy, sz));

class Batch {
  constructor() { this.m = new Map(); }
  add(geo, mat, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    if (!this.m.has(mat)) this.m.set(mat, []);
    this.m.get(mat).push(g);
    return g;
  }
  box(mat, w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), mat, mat4(x, y, z, rx, ry, rz)); }
  build(parent, cast = true, receive = true) {
    for (const [mat, list] of this.m) {
      const geo = mergeGeometries(list);
      if (mat.userData.tile) worldUV(geo, mat.userData.tile); // box-projected so scans keep real-world scale
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive; mesh.matrixAutoUpdate = false;
      parent.add(mesh);
    }
  }
}
function gradientTex(stops, w = 4, h = 128) {
  const c = T.canvas(w, h), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, renderer) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const brick = [0, 1, 2, 3].map((s) => std({ ...T.brickSet(s), roughness: 1 }));
  const snowSet = T.snowSet();
  const M = {
    snow: std({ ...snowSet, roughness: 1, normalScale: new THREE.Vector2(0.7, 0.7) }),
    snowCap: std({ color: 0xeef3f8, roughness: 0.88 }),
    teal: std({ map: T.paintedMetal([62, 104, 98], 6), roughness: 0.5, metalness: 0.1 }),
    utility: std({ color: 0x8c9196, roughness: 0.5, metalness: 0.3 }),
    tube: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.3, 2.4) }),
    void: new THREE.MeshBasicMaterial({ color: 0x050506 }),
    concrete: std({ ...T.concreteSet(), roughness: 0.92 }),
    stone: std({ color: 0x9a948a, roughness: 0.85 }),
    dark: std({ color: 0x1c1e21, roughness: 0.55, metalness: 0.7 }),
    steel: std({ color: 0x7d838a, roughness: 0.4, metalness: 0.85 }),
    green: std({ map: T.paintedMetal([44, 74, 56]), roughness: 0.55, metalness: 0.1 }),
    blue: std({ map: T.paintedMetal([38, 58, 92]), roughness: 0.55, metalness: 0.1 }),
    rust: std({ map: T.paintedMetal([130, 52, 30]), roughness: 0.6, metalness: 0.1 }),
    door: std({ map: T.paintedMetal([58, 66, 64]), roughness: 0.6, metalness: 0.1 }),
    wood: std({ map: T.woodTex(), roughness: 0.85 }),
    rubber: std({ color: 0x0e0e0f, roughness: 0.92 }),
    paint: new THREE.MeshPhysicalMaterial({ color: 0x5b1c18, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.15 }),
    van: std({ map: T.paintedMetal([196, 198, 194], 3), roughness: 0.45, metalness: 0.4 }),
    glass: std({ color: 0x0a0f15, roughness: 0.12, metalness: 0.3, envMapIntensity: 1.8 }),
    frame: std({ color: 0x272b2a, roughness: 0.55, metalness: 0.1 }),
    bags: std({ color: 0x0b0c0d, roughness: 0.28, metalness: 0.1 }),
    yellow: std({ color: 0xc89a12, roughness: 0.6 }),
    ice: std({ color: 0xdcecff, roughness: 0.15, transparent: true, opacity: 0.82, envMapIntensity: 2.2 }),
    ao: new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: gradientTex([[0, '#000'], [0.55, '#404040'], [1, '#9a9a9a']]), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
  };
  M.ao.alphaMap.colorSpace = THREE.NoColorSpace;
  M.streaks = new THREE.MeshBasicMaterial({ color: 0x2b241c, alphaMap: T.streakTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const gate = T.corrugated([92, 96, 100]), garage = T.corrugated([132, 116, 72]);
  M.gate = std({ ...gate, roughness: 0.5, metalness: 0.6 });
  M.garage = std({ ...garage, roughness: 0.55, metalness: 0.4 });
  M.louver = std({ ...T.corrugated([64, 66, 70], true), roughness: 0.5, metalness: 0.6 });
  const link = T.chainLink(); link.repeat.set(7 / 0.5, 3.8 / 0.5);
  M.fence = std({ map: link, alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 });

  const B = new Batch(), Bns = new Batch(); // Bns: no shadow casting (small detail)
  let doorways = 0;
  M.fenceRoof = std({ map: T.chainLink(), alphaTest: 0.5, side: THREE.DoubleSide, metalness: 0.7, roughness: 0.45 });
  const root = new THREE.Group(); scene.add(root);
  [[1.2, 1.15, 1.06], [1.16, 1.12, 1.04], [1, 1, 1], [1.08, 1.0, 0.88]].map((c) => new THREE.Color(...c)).forEach((c, s) => photo(brick[s], s === 2 ? 'redbrick' : 'brick', s === 2 ? 1.8 / 2.5 : 1.8 / 2, c));
  photo(M.snow, 'ground', 1, new THREE.Color(1.2, 1.18, 1.12));
  // scans with userData.tile get box-projected UVs at that size (metres per texture repeat) when batched
  Object.assign(M.stone.userData, { tile: 2 }); photo(M.stone, 'stone', 1, new THREE.Color(1.1, 1.06, 1.0));
  Object.assign(M.concrete.userData, { tile: 2.5 }); photo(M.concrete, 'concrete', 1, new THREE.Color(1.3, 1.3, 1.28), 1.6);
  Object.assign(M.wood.userData, { tile: 2 }); photo(M.wood, 'wood', 1, 0xffffff);
  // one light, worn paint scan tinted per use (the scan averages 0.8, so tints sit 1/0.8 above the wanted colour)
  for (const [k, c] of Object.entries({ door: 0x4a5350, teal: 0x4e827a, green: 0x375d46, blue: 0x304873, rust: 0xa2412a, utility: 0xafb5bc, frame: 0x313635 })) {
    M[k].userData.tile = 1.5; photo(M[k], 'paint', 1, c, 2.2); // weathered paint is matte, the scan is glossier
  }

  // ---- ground
  const ground = worldUV(new THREE.PlaneGeometry(80, 130).rotateX(-Math.PI / 2).translate(0, 0, -12), 8);
  const gm = new THREE.Mesh(ground, M.snow); gm.receiveShadow = true; root.add(gm);

  // ---- buildings, facades
  const winFrames = [], winGlass = [], winLit = [], sills = [], sillSnow = [], lintels = [], icicles = [];
  for (const [x0, z0, x1, z1, h, style] of BUILDINGS) {
    worldUV(B.box(brick[style], x1 - x0, h, z1 - z0, (x0 + x1) / 2, h / 2, (z0 + z1) / 2), 1.8);
    // stepped stone cornice + snow along the roof line (casts a crisp shadow line down the facade)
    for (const [ax, sx, sz] of [[0, 0, -1], [0, 0, 1], [1, -1, 0], [1, 1, 0]]) {
      const len = ax ? z1 - z0 : x1 - x0, ex = sx < 0 ? x0 : sx > 0 ? x1 : (x0 + x1) / 2, ez = sz < 0 ? z0 : sz > 0 ? z1 : (z0 + z1) / 2;
      const band = (out, y0, y1, mat, extra = 0) => {
        const dpt = 0.3 + out, w = ax ? dpt : len + 2 * out + extra, d = ax ? len + 2 * out + extra : dpt;
        return B.box(mat, w, y1 - y0, d, ex + sx * (out - dpt / 2), (y0 + y1) / 2, ez + sz * (out - dpt / 2));
      };
      band(0.08, h - 0.42, h - 0.24, M.stone); band(0.2, h - 0.24, h + 0.06, M.stone);
      band(0.18, h + 0.06, h + 0.16, M.snowCap, -0.04);
    }
    const faces = [[0, 1, z1, x0, x1], [0, -1, z0, x0, x1], [1, 0, x1, z0, z1], [-1, 0, x0, z0, z1]];
    for (const [nx, nz, c, a0, a1] of faces) {
      const ry = Math.atan2(nx, nz);
      let pipeDone = false, anyOpen = false;
      for (let u = a0 + 1.3; u <= a1 - 1.3 + 1e-6; u += 2.6) {
        const wx = nx ? c : u, wz = nx ? u : c;
        if (!isOpen(wx + nx * 1.0, wz + nz * 1.0)) continue;
        const at = (out, y) => [wx + nx * out, y, wz + nz * out];
        anyOpen = true;
        // fake contact shadow at the wall base, and rain streaks run down from the cornice (one of four strips per bay)
        Bns.add(new THREE.PlaneGeometry(2.6, 1.1), M.ao, mat4(...at(0.012, 0.55), 0, ry));
        const sg = new THREE.PlaneGeometry(2.6, h), suv = sg.attributes.uv, k = (rnd() * 4) | 0;
        for (let i = 0; i < suv.count; i++) suv.setX(i, (suv.getX(i) + k) / 4);
        Bns.add(sg, M.streaks, mat4(...at(0.011, h / 2), 0, ry));
        if (rnd() < 0.45) B.add(new THREE.SphereGeometry(1, 10, 6), M.snowCap, mat4(...at(0.15, 0), 0, ry, 0, 0.7 + rnd() * 0.9, 0.2 + rnd() * 0.25, 0.45 + rnd() * 0.4));
        if (!pipeDone && rnd() < 0.25) { pipeDone = true; Bns.add(new THREE.CylinderGeometry(0.055, 0.055, h - 0.3, 8), M.steel, mat4(...at(0.1, h / 2), 0, ry).multiply(mat4(1.3, 0, 0))); }
        const r = rnd();
        if (r < 0.16) { // steel door, louvered service door, or a propped-open door into a lit stairwell
          const kind = r < 0.07 ? 0 : r < 0.13 ? 1 : doorways < 3 ? 2 : 0;
          if (kind === 2) {
            doorways++;
            Bns.add(new THREE.PlaneGeometry(1.0, 2.15), M.void, mat4(...at(0.012, 1.075), 0, ry));
            Bns.box(M.tube, 0.7, 0.04, 0.04, ...at(0.03, 2.05), ry);
            Bns.add(new THREE.BoxGeometry(1.0, 2.15, 0.05), M.door, mat4(...at(0.03, 1.075), 0, ry).multiply(mat4(-0.5, 0, 0, 0, -1.25, 0)).multiply(mat4(0.5, 0, 0)));
          } else Bns.box(kind ? M.louver : M.door, 1.0, 2.15, 0.06, ...at(0.03, 1.075), ry);
          Bns.box(M.frame, 1.2, 0.1, 0.1, ...at(0.05, 2.2), ry);
          if (rnd() < 0.5) Bns.box(M.snowCap, 1.3, 0.06, 0.35, ...at(0.2, 0.03), ry);
        } else if (rnd() < 0.3) { // electric meters with conduit running up the wall
          const n = 1 + (rnd() < 0.5), y0 = 1.25 + rnd() * 0.4;
          for (let k = 0; k < n; k++) {
            const off = (k - (n - 1) / 2) * 0.45, local = mat4(...at(0.1, y0), 0, ry).multiply(mat4(off, 0, 0));
            Bns.add(new THREE.BoxGeometry(0.34, 0.46, 0.16), M.utility, local);
            Bns.add(new THREE.CylinderGeometry(0.018, 0.018, 2.2 + rnd() * 2, 6), M.utility, local.clone().multiply(mat4(0, 1.3, -0.05)));
          }
        }
        if (rnd() < 0.42) continue; // blank stretch of wall
        for (let fy = 4.4, fl = 0; fy + 1.7 < h - 0.9; fy += 3.2, fl++) {
          const cy = fy + 0.85;
          const mGlass = mat4(...at(0.02, cy), 0, ry), mFrame = mat4(...at(0.05, cy), 0, ry);
          winFrames.push(mFrame);
          (rnd() < 0.35 ? winLit : winGlass).push(mGlass);
          sills.push(mat4(...at(0.12, cy - 0.89), 0, ry));
          sillSnow.push(mat4(...at(0.13, cy - 0.82), 0, ry, 0, 1, 0.6 + rnd() * 0.8, 1));
          lintels.push(mat4(...at(0.03, cy + 0.93), 0, ry));
          if (rnd() < 0.45) for (let k = 0, n = 2 + (rnd() * 4) | 0; k < n; k++) {
            const len = 0.06 + Math.pow(rnd(), 2) * 0.35, side = (rnd() - 0.5) * 1.2;
            icicles.push(mat4(wx + nx * 0.2 + (nz ? side : 0), cy - 0.93, wz + nz * 0.2 + (nx ? side : 0), Math.PI, 0, 0, 1, len, 1));
          }
          if (fl > 0 && rnd() < 0.1) { // AC unit under the window
            const [ax, ay, az] = at(0.3, cy - 1.25);
            Bns.box(M.steel, 0.78, 0.48, 0.52, ax, ay, az, ry);
            Bns.box(M.snowCap, 0.74, 0.08, 0.48, ax, ay + 0.28, az, ry);
          }
        }
      }
      if (anyOpen) for (let fy = 3.9; fy < h - 1.2; fy += 3.2) { // stone string course at each floor
        const len = a1 - a0, mid = (a0 + a1) / 2;
        Bns.box(M.stone, nx ? 0.1 : len, 0.12, nx ? len : 0.1, nx ? c + nx * 0.05 : mid, fy, nx ? mid : c + nz * 0.05);
      }
      if (anyOpen && h <= 7.5) { // chain-link fence along the roof edge
        const len = a1 - a0, mid = (a0 + a1) / 2, fx = nx ? c - nx * 0.15 : mid, fz = nx ? mid : c - nz * 0.15;
        const g = new THREE.PlaneGeometry(len, 2.1), uv = g.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.5, uv.getY(i) * 2.1 / 0.5);
        Bns.add(g, M.fenceRoof, mat4(fx, h + 0.28 + 1.05, fz, 0, ry));
        for (let u = a0 + 0.2; u <= a1; u += 2.4) Bns.add(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), M.steel, mat4(nx ? fx : u, h + 0.28 + 1.1, nx ? u : fz));
        Bns.add(new THREE.CylinderGeometry(0.025, 0.025, len, 6), M.steel, mat4(fx, h + 2.35, fz, 0, ry, Math.PI / 2));
      }
    }
  }
  const frameGeo = mergeGeometries([[1.2, 0.07, 0.1, 0, 0.815], [1.2, 0.07, 0.1, 0, -0.815], [0.07, 1.7, 0.1, -0.565, 0], [0.07, 1.7, 0.1, 0.565, 0], [0.04, 1.56, 0.06, 0, 0], [1.06, 0.04, 0.06, 0, 0.25]]
    .map(([w, h, d, x, y]) => new THREE.BoxGeometry(w, h, d).translate(x, y, 0)));
  const litMat = std({ map: T.blindsTex(), roughness: 0.5, metalness: 0.1 });
  const inst = (geo, mat, list, cast = false) => {
    if (!list.length) return null;
    if (mat.userData.tile) worldUV(geo, mat.userData.tile);
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.castShadow = cast; m.receiveShadow = true; root.add(m);
    return m;
  };
  inst(frameGeo, M.frame, winFrames);
  inst(new THREE.PlaneGeometry(1.06, 1.56), M.glass, winGlass);
  const lit = inst(new THREE.PlaneGeometry(1.06, 1.56), litMat, winLit);
  inst(new THREE.BoxGeometry(1.36, 0.08, 0.24), M.stone, sills, true);
  inst(new THREE.BoxGeometry(1.3, 0.06, 0.2), M.snowCap, sillSnow);
  inst(new THREE.BoxGeometry(1.36, 0.16, 0.06), M.stone, lintels);
  inst(new THREE.ConeGeometry(0.022, 1, 5).translate(0, 0.5, 0), M.ice, icicles);

  // ---- fire escapes
  const fireEscape = (wallX, out, z0, z1, floors) => {
    const len = z1 - z0, cz = (z0 + z1) / 2, px = wallX + out * 0.55;
    floors.forEach((y, i) => {
      Bns.box(M.dark, 1.0, 0.05, len, px, y, cz);
      Bns.box(M.snowCap, 0.92, 0.07, len - 0.1, px, y + 0.06, cz);
      Bns.box(M.dark, 0.04, 0.04, len, wallX + out * 1.03, y + 1.0, cz);
      Bns.box(M.dark, 0.04, 0.04, len, wallX + out * 1.03, y + 0.5, cz);
      for (let z = z0; z <= z1 + 1e-6; z += 0.62) Bns.box(M.dark, 0.03, 1.0, 0.03, wallX + out * 1.03, y + 0.5, z);
      for (const ez of [z0, z1]) Bns.box(M.dark, 1.0, 0.04, 0.04, px, y + 1.0, ez);
      for (let k = 0; k < 5; k++) Bns.add(new THREE.ConeGeometry(0.02, 0.3, 5).rotateX(Math.PI).translate(0, -0.15, 0), M.ice, mat4(px + (rnd() - 0.5) * 0.8, y - 0.03, z0 + rnd() * len, 0, 0, 0, 1, 0.4 + rnd() * 1.2, 1));
      const next = floors[i + 1];
      if (next !== undefined) { // stair flight inside the landing footprint
        const rise = next - y, steps = 12, run = Math.min(len - 0.6, 3.4);
        for (let s = 0; s < steps; s++) Bns.box(M.dark, 0.7, 0.03, 0.26, wallX + out * 0.4, y + rise * (s + 1) / (steps + 1), z0 + 0.3 + run * (s + 0.5) / steps);
        const ang = Math.atan2(rise, run), sl = Math.hypot(rise, run);
        for (const off of [0.05, 0.75]) Bns.box(M.dark, 0.03, 0.12, sl, wallX + out * off, y + rise / 2, z0 + 0.3 + run / 2, 0, -ang, 0);
      }
    });
    const ly = floors[0];
    for (const off of [0.25, 0.75]) Bns.box(M.dark, 0.03, ly - 2.2, 0.03, wallX + out * off, (ly + 2.2) / 2, z1 - 0.3);
    for (let y = 2.4; y < ly; y += 0.3) Bns.box(M.dark, 0.5, 0.02, 0.02, wallX + out * 0.5, y, z1 - 0.3);
  };
  fireEscape(-3.5, 1, 26.6, 32, [4.2, 7.4]);
  fireEscape(3.5, -1, -34.5, -29, [3.8, 6.1]);

  // ---- overhead wires
  for (const [z, h, dz] of [[-31, 7.2, 2], [-22, 7.0, -1.5], [2, 5.2, 2], [16, 8.6, 1], [25, 5.4, -2]]) {
    const a = new THREE.Vector3(-3.5, h, z), b = new THREE.Vector3(3.5, h - 0.3, z + dz), mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.7, 0));
    Bns.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.012, 4), M.dark);
  }

  // ---- props
  const snowTop = (w, d, x, y, z, ry = 0) => Bns.box(M.snowCap, w, 0.07, d, x, y + 0.035, z, ry);
  const trashBags = (x, z, n) => {
    for (let i = 0; i < n; i++) {
      const g = new THREE.IcosahedronGeometry(0.32, 1), p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const s = 0.85 + rnd() * 0.3; p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.8, p.getZ(k) * s); }
      g.computeVertexNormals();
      B.add(g, M.bags, mat4(x + (rnd() - 0.5) * 1.1, 0.22, z + (rnd() - 0.5) * 1.1, rnd(), rnd() * 6, 0));
    }
  };
  const crate = (x, y, z, s, ry) => {
    B.box(M.wood, s, s, s, x, y + s / 2, z, ry);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = Math.cos(ry), sn = Math.sin(ry), lx = ox * (s / 2 - 0.03), lz = oz * (s / 2 - 0.03);
      Bns.box(M.frame, 0.07, s + 0.01, 0.07, x + c * lx + sn * lz, y + s / 2, z - sn * lx + c * lz, ry);
    }
  };
  for (const p of PROPS) {
    const { x, z } = p;
    if (p.t === 'dumpster') {
      const ry = p.rz ? Math.PI / 2 : 0, mat = rnd() < 0.5 ? M.green : M.blue;
      B.box(mat, 1.9, 1.05, 1.06, x, 0.68, z, ry);
      B.box(mat, 1.94, 0.06, 1.12, x, 1.24, z, ry, 0.05);
      for (const s of [-1, 1]) Bns.box(M.dark, 1.96, 0.12, 0.08, x + (p.rz ? s * 0.57 : 0), 0.9, z + (p.rz ? 0 : s * 0.57), ry);
      for (const [a, b] of [[-0.8, -0.42], [0.8, -0.42], [-0.8, 0.42], [0.8, 0.42]]) {
        const wx = p.rz ? x + b : x + a, wz = p.rz ? z + a : z + b;
        Bns.add(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10), M.rubber, mat4(wx, 0.08, wz, Math.PI / 2, ry, 0));
      }
      snowTop(1.8, 1.0, x, 1.27, z, ry);
      B.add(new THREE.SphereGeometry(0.5, 10, 6), M.snowCap, mat4(x, 1.3, z, 0, ry, 0, 1.4, 0.18, 0.8));
      trashBags(x + (p.rz ? 0.2 : 0), z + (p.rz ? 1.5 : 0.9), 3);
    } else if (p.t === 'crate') {
      const ry = (rnd() - 0.5) * 0.1;
      crate(x, 0, z, p.s, ry);
      let top = p.s;
      if (p.stack === 2) { crate(x, p.s, z, p.s * 0.98, ry + (rnd() - 0.5) * 0.15); top = p.s * 1.98; }
      snowTop(p.s * 0.92, p.s * 0.92, x, top, z, ry);
    } else if (p.t === 'cabinet') { // pad-mounted electrical cabinet
      const ry = p.rz ? Math.PI / 2 : 0;
      B.box(M.teal, 1.6, 1.15, 1.0, x, 0.675, z, ry);
      Bns.box(M.concrete, 1.75, 0.1, 1.15, x, 0.05, z, ry);
      const c = Math.cos(ry), s = Math.sin(ry);
      for (const side of [-1, 1]) {
        Bns.box(M.dark, 0.012, 0.95, 0.012, x + s * side * 0.505, 0.68, z + c * side * 0.505, ry);
        Bns.box(M.yellow, 0.16, 0.1, 0.01, x + c * 0.45 + s * side * 0.506, 0.95, z - s * 0.45 + c * side * 0.506, ry);
      }
      snowTop(1.5, 0.9, x, 1.25, z, ry);
    } else if (p.t === 'barrier') {
      const sh = new THREE.Shape([[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.14, 0.3], [0.08, 0.85], [-0.08, 0.85], [-0.14, 0.3], [-0.3, 0.08]].map(([a, b]) => new THREE.Vector2(a, b)));
      const g = new THREE.ExtrudeGeometry(sh, { depth: 2.96, bevelEnabled: false }).translate(0, 0, -1.48).rotateY(Math.PI / 2);
      B.add(g, M.concrete, mat4(x, 0, z));
      snowTop(2.9, 0.14, x, 0.85, z);
    } else if (p.t === 'pallets') {
      for (let i = 0; i < 4; i++) {
        const y = i * 0.137;
        for (const s of [-0.42, 0, 0.42]) Bns.box(M.wood, 0.1, 0.09, 1.2, x + s, y + 0.045, z);
        B.box(M.wood, 1.0, 0.035, 1.2, x, y + 0.11, z);
      }
      snowTop(0.95, 1.12, x, 0.55, z);
    } else if (p.t === 'barrel') {
      const mat = rnd() < 0.5 ? M.rust : M.blue;
      B.add(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18), mat, mat4(x, 0.44, z));
      for (const y of [0.25, 0.63]) Bns.add(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 18), mat, mat4(x, y, z));
      Bns.add(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 18), M.snowCap, mat4(x, 0.9, z));
    } else if (p.t === 'car') {
      const body = new THREE.Shape([[-2.25, 0.32], [-2.25, 0.78], [-2.0, 0.97], [2.05, 0.9], [2.25, 0.66], [2.25, 0.32], [1.75, 0.3], [1.5, 0.62], [1.0, 0.62], [0.78, 0.3], [-0.85, 0.3], [-1.07, 0.62], [-1.57, 0.62], [-1.8, 0.3]].map(([a, b]) => new THREE.Vector2(a, b)));
      B.add(new THREE.ExtrudeGeometry(body, { depth: 1.72, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -0.9), M.paint, mat4(x, 0, z));
      const cab = new THREE.Shape([[-1.28, 0.95], [-0.96, 1.41], [0.36, 1.44], [1.02, 0.92]].map(([a, b]) => new THREE.Vector2(a, b)));
      B.add(new THREE.ExtrudeGeometry(cab, { depth: 1.5, bevelEnabled: false }).translate(0, 0, -0.75), M.glass, mat4(x, 0, z));
      B.box(M.paint, 1.36, 0.05, 1.52, x - 0.3, 1.44, z);
      Bns.box(M.snowCap, 1.3, 0.1, 1.42, x - 0.3, 1.51, z);
      Bns.box(M.snowCap, 0.9, 0.06, 1.6, x - 1.6, 0.99, z, 0, 0, -0.05);
      Bns.box(M.snowCap, 0.95, 0.06, 1.6, x + 1.5, 0.93, z, 0, 0, -0.06);
      for (const [a, b] of [[-1.32, -0.82], [-1.32, 0.82], [1.25, -0.82], [1.25, 0.82]]) B.add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 18), M.rubber, mat4(x + a, 0.33, z + b, Math.PI / 2));
      Bns.box(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x550804) }), 0.05, 0.1, 0.3, x - 2.27, 0.75, z - 0.6);
      Bns.box(new THREE.MeshBasicMaterial({ color: new THREE.Color(0x550804) }), 0.05, 0.1, 0.3, x - 2.27, 0.75, z + 0.6);
    } else if (p.t === 'van') {
      const body = new THREE.Shape([[-2.6, 0.4], [-2.6, 2.3], [1.2, 2.3], [1.55, 2.0], [2.25, 1.15], [2.6, 1.05], [2.6, 0.4]].map(([a, b]) => new THREE.Vector2(a, b)));
      const rot = mat4(x, 0, z, 0, Math.PI / 2, 0);
      B.add(new THREE.ExtrudeGeometry(body, { depth: 1.92, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 }).translate(0, 0, -0.96), M.van, rot);
      const win = new THREE.Shape([[1.12, 1.25], [1.12, 2.04], [1.6, 2.04], [2.3, 1.22]].map(([a, b]) => new THREE.Vector2(a, b)));
      B.add(new THREE.ExtrudeGeometry(win, { depth: 2.02, bevelEnabled: false }).translate(0, 0, -1.01), M.glass, rot);
      Bns.box(M.snowCap, 1.9, 0.12, 3.7, x, 2.38, z + 0.75);
      for (const [a, b] of [[-0.88, -1.7], [0.88, -1.7], [-0.88, 1.6], [0.88, 1.6]]) B.add(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 18), M.rubber, mat4(x + a, 0.38, z + b, 0, 0, Math.PI / 2));
    } else if (p.t === 'wall') {
      const w = p.x1 - p.x0, d = p.z1 - p.z0;
      worldUV(B.box(brick[0], w, p.h, d, (p.x0 + p.x1) / 2, p.h / 2, (p.z0 + p.z1) / 2), 1.8);
      Bns.box(M.stone, w + 0.08, 0.08, d + 0.08, (p.x0 + p.x1) / 2, p.h + 0.04, (p.z0 + p.z1) / 2);
      snowTop(w, d, (p.x0 + p.x1) / 2, p.h + 0.08, (p.z0 + p.z1) / 2);
    } else if (p.t === 'dock') {
      B.box(M.concrete, 3.5, 1.15, 16, 28.25, 0.575, -13);
      B.box(M.concrete, 1.2, 0.38, 1.4, 25.9, 0.19, -5.7);
      B.box(M.concrete, 0.8, 0.77, 1.4, 26.1, 0.385, -5.7);
      Bns.box(M.yellow, 0.12, 0.012, 16, 26.58, 1.156, -13);
      snowTop(3.2, 15.4, 28.4, 1.15, -13.2);
      for (const bz of [-19, -15, -11, -7.4]) Bns.box(M.rubber, 0.14, 0.45, 0.32, 26.43, 0.75, bz);
      for (const gz of [-17, -9.6]) {
        Bns.box(M.garage, 0.06, 3.2, 3.0, 29.97, 2.75, gz);
        Bns.box(M.frame, 0.12, 0.15, 3.3, 29.94, 4.4, gz);
      }
    } else if (p.t === 'fence') {
      const fz = p.z;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.8), M.fence); g.position.set(0, 1.9, fz); g.castShadow = true; root.add(g);
      for (const fx of [-3.42, -1.75, 0, 1.75, 3.42]) Bns.add(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), M.steel, mat4(fx, 2.1, fz));
      Bns.add(new THREE.CylinderGeometry(0.03, 0.03, 7, 8), M.steel, mat4(0, 3.8, fz, 0, 0, Math.PI / 2));
      for (const [wy, wz] of [[3.95, 0.05], [4.12, 0.12], [4.3, 0.2]]) Bns.add(new THREE.CylinderGeometry(0.006, 0.006, 7, 4), M.steel, mat4(0, wy, fz + wz, 0, 0, Math.PI / 2));
      B.add(new THREE.SphereGeometry(1, 12, 6), M.snowCap, mat4(0, 0, fz + 0.2, 0, 0, 0, 3.6, 0.3, 0.6));
      crate(2.5, 0, -46, 1, 0.2); snowTop(0.9, 0.9, 2.5, 1, -46, 0.2);
      B.box(M.green, 1.1, 1.05, 1.9, -2.7, 0.68, -50); snowTop(1.0, 1.8, -2.7, 1.22, -50);
    } else if (p.t === 'gate') {
      B.box(M.gate, 7, 4.5, 0.08, 0, 2.25, p.z + 0.15);
      Bns.box(M.dark, 7.2, 0.4, 0.3, 0, 4.6, p.z + 0.15);
      B.add(new THREE.SphereGeometry(1, 12, 6), M.snowCap, mat4(0, 0, p.z - 0.1, 0, 0, 0, 3.6, 0.35, 0.7));
    }
  }
  trashBags(-3, 9.8, 2); trashBags(3, 26, 3); trashBags(-15, 1.5, 2); trashBags(17, -22.5, 3);
  // manhole cover
  Bns.add(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 20), M.dark, mat4(-0.4, 0.012, 4));

  // ---- lamps, neon
  for (const L of LAMPS) { // daytime: fixtures only
    const [lx, ly, lz] = L.p, [nx, nz] = L.n, ry = Math.atan2(nx, nz);
    const bx = lx + nx * 0.55, bz = lz + nz * 0.55;
    Bns.box(M.dark, 0.06, 0.06, 0.6, lx + nx * 0.3, ly + 0.25, lz + nz * 0.3, ry);
    Bns.add(new THREE.ConeGeometry(0.26, 0.22, 16, 1, true), M.dark, mat4(bx, ly + 0.18, bz));
    Bns.box(M.snowCap, 0.3, 0.04, 0.3, bx, ly + 0.3, bz);
    Bns.add(new THREE.SphereGeometry(0.07, 10, 8), M.glass, mat4(bx, ly + 0.1, bz));
  }
  for (const N of NEON) {
    const tex = T.neonTex(N.text, N.color, N.vertical), mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.1, 1.1, 1.1) });
    if (N.vertical) {
      const [sx, sy, sz] = N.p;
      Bns.box(M.dark, 0.9, 2.9, 0.22, sx, sy, sz);
      for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 2.7), mat); m.position.set(sx, sy, sz + s * 0.115); m.rotation.y = s < 0 ? Math.PI : 0; root.add(m); }
      Bns.box(M.dark, 0.9, 0.05, 0.05, sx, sy + 1.2, sz);
    } else {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), mat);
      m.position.set(...N.p); m.rotation.y = Math.atan2(N.n[0], N.n[1]); root.add(m);
      Bns.box(M.door, 0.06, 2.15, 1.0, N.p[0] + 0.03, 1.075, N.p[2]);
    }
  }

  // ---- rooftop silhouettes: stair bulkheads, HVAC units, vent stacks
  for (const [x0, z0, x1, z1, h, style] of BUILDINGS) {
    const w = x1 - x0, d = z1 - z0;
    if (w < 6 || d < 6) continue;
    worldUV(B.box(brick[style], 3.2, 2.6, 3.0, (x0 + x1) / 2 + (rnd() - 0.5) * (w - 6), h + 1.3, (z0 + z1) / 2 + (rnd() - 0.5) * (d - 6)), 1.8);
    for (let k = 0; k < 3; k++) {
      const x = x0 + 1.5 + rnd() * (w - 3), z = z0 + 1.5 + rnd() * (d - 3);
      if (rnd() < 0.5) { B.box(M.steel, 1.5, 1.0, 1.1, x, h + 0.5, z); Bns.add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), M.dark, mat4(x, h + 1.03, z)); }
      else { B.add(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 10), M.steel, mat4(x, h + 0.8, z)); Bns.add(new THREE.ConeGeometry(0.26, 0.2, 10), M.steel, mat4(x, h + 1.7, z)); }
    }
  }

  // ---- rooftop water tanks and the skyline beyond the block
  const Bfar = new Batch(), staves = std({ map: T.stavesTex(), roughness: 0.9 });
  const facade = [0, 1, 2, 3].map((k) => std({ map: T.facadeTex(k), roughness: k ? 0.85 : 0.2, metalness: k ? 0 : 0.5, envMapIntensity: k ? 1 : 1.6 }));
  const tank = (bat, x, y, z, s = 1) => {
    bat.add(new THREE.CylinderGeometry(2.1 * s, 2.1 * s, 3.2 * s, 20), staves, mat4(x, y + 3.2 * s + 1.6 * s, z));
    for (const hy of [0.5, 1.4, 2.3, 3.0]) bat.add(new THREE.CylinderGeometry(2.13 * s, 2.13 * s, 0.05 * s, 20), M.dark, mat4(x, y + 3.2 * s + hy * s, z));
    bat.add(new THREE.ConeGeometry(2.25 * s, 1.1 * s, 20), staves, mat4(x, y + 3.2 * s + 3.75 * s, z));
    bat.add(new THREE.CylinderGeometry(2.2 * s, 2.2 * s, 0.12 * s, 20), M.dark, mat4(x, y + 3.15 * s, z));
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; bat.add(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 3.2 * s, 6), M.dark, mat4(x + Math.cos(a) * 1.7 * s, y + 1.6 * s, z + Math.sin(a) * 1.7 * s)); }
    bat.add(new THREE.BoxGeometry(3.6 * s, 0.06 * s, 0.06 * s), M.dark, mat4(x, y + 1.4 * s, z, 0, 0.4, 0));
    bat.add(new THREE.BoxGeometry(3.6 * s, 0.06 * s, 0.06 * s), M.dark, mat4(x, y + 1.4 * s, z, 0, 1.9, 0));
  };
  for (const [x, y, z] of [[-10, 11, 28], [11, 12, 2], [26, 9, -33], [-10, 9, -42], [-24, 7, 26]]) tank(B, x, y, z);
  const tower = (x, z, w, d, h, k) => {
    worldUV(Bfar.box(facade[k], w, h, d, x, h / 2, z), k === 3 ? 8 : 14);
    Bfar.box(M.concrete, w * 0.5, 4, d * 0.5, x, h + 2, z);
    if (k === 1 && h > 90) worldUV(Bfar.box(facade[1], w * 0.7, h * 0.12, d * 0.7, x, h + h * 0.06, z), 14);
    if (h > 120 && rnd() < 0.5) Bfar.add(new THREE.CylinderGeometry(0.3, 0.6, 22, 6), M.steel, mat4(x, h + 11, z));
  };
  const near = [[-60, -30, 0, 34], [-58, 18, 3, 28], [-46, 60, 3, 30], [55, -40, 3, 26], [60, 10, 0, 36], [40, 58, 3, 24], [0, -100, 1, 40], [-30, -95, 3, 26], [28, -92, 2, 32]];
  for (const [x, z, k, h] of near) { tower(x, z, 26, 22, h, k); if (k === 3) tank(Bfar, x + 4, h, z - 3, 1.2); }
  for (let i = 0; i < 26; i++) {
    const a = i / 26 * Math.PI * 2 + rnd() * 0.15, r = 120 + rnd() * 130;
    tower(Math.cos(a) * r, -12 + Math.sin(a) * r, 24 + rnd() * 26, 22 + rnd() * 24, 60 + rnd() * 150, (i * 7) % 3);
  }

  B.build(root, true, true);
  Bns.build(root, false, true);
  Bfar.build(root, false, false);

  // ---- sky dome + environment map for reflections
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sunDir: { value: SUN.clone() }, time: { value: 0 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sunDir; uniform float time; varying vec3 vD;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vD); float h = max(d.y, 0.0), sd = max(dot(d, sunDir), 0.0);
        vec3 col = mix(vec3(0.62, 0.74, 0.9), vec3(0.11, 0.3, 0.66), pow(h, 0.5));
        col += vec3(1.0, 0.9, 0.75) * (pow(sd, 1500.0) * 40.0 + pow(sd, 10.0) * 0.18);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 0.75 + vec2(time * 0.006, time * 0.003);
          float c = smoothstep(0.5, 0.78, fbm(uv)) * smoothstep(0.02, 0.22, d.y);
          vec3 cc = mix(vec3(0.78, 0.82, 0.88), vec3(1.15, 1.12, 1.08), 0.55 + 0.45 * pow(sd, 3.0));
          col = mix(col, cc, c * 0.92);
        } else col = mix(vec3(0.6, 0.66, 0.74), vec3(0.42, 0.44, 0.47), min(1.0, -d.y * 3.0));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), skyMat));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd4d4d2 }));
  floor.position.y = -1.5; envScene.add(floor);
  for (const [x, z, w, h] of [[-6, 2, 3, 6], [6, -3, 4, 8], [1, 7, 5, 5]]) { // nearby facades in the reflections
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ color: 0xc9b99c })); b.position.set(x, h / 2 - 1.5, z); envScene.add(b);
  }
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(envScene, 0.04).texture;
  scene.environmentIntensity = 0.75;

  // ---- falling snow, lit by the lamps it drifts past
  const N = 2500, pos = new Float32Array(N * 3), spd = new Float32Array(N), ph = new Float32Array(N), sc = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 40; pos[i * 3 + 1] = Math.random() * 24; pos[i * 3 + 2] = Math.random() * 40; spd[i] = 0.7 + Math.random() * 0.9; ph[i] = Math.random() * 6.28; sc[i] = 0.5 + Math.random(); }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  sg.setAttribute('aScale', new THREE.BufferAttribute(sc, 1));
  const snowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uSize: { value: 600 }, uWind: { value: new THREE.Vector3(1.4, 0, 0.6) } },
    vertexShader: `uniform float uTime, uSize; uniform vec3 uCam, uWind;
      attribute float aSpeed, aPhase, aScale; varying float vA; varying vec3 vC;
      void main(){
        vec3 box = vec3(40.0, 24.0, 40.0), p = position;
        p.y -= aSpeed * uTime;
        p.x += uWind.x * uTime + sin(uTime * 0.7 + aPhase) * 0.4;
        p.z += uWind.z * uTime + cos(uTime * 0.6 + aPhase * 1.3) * 0.4;
        vec3 base = uCam - box * vec3(0.5, 0.35, 0.5);
        p = base + mod(p - base, box);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = max(1.2, uSize * 0.022 * aScale / d);
        vC = vec3(1.25, 1.27, 1.3);
        vA = smoothstep(0.15, 1.2, d) * (1.0 - smoothstep(14.0, 22.0, d));
      }`,
    fragmentShader: 'varying float vA; varying vec3 vC; void main(){ float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vC, a * vA * 0.5); }',
  });
  const snowPts = new THREE.Points(sg, snowMat);
  snowPts.frustumCulled = false; snowPts.renderOrder = 2; scene.add(snowPts);

  return {
    resize(h, fov) { snowMat.uniforms.uSize.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); },
    update(t, cam) { snowMat.uniforms.uTime.value = t; snowMat.uniforms.uCam.value.copy(cam.position); skyMat.uniforms.time.value = t; },
  };
}
