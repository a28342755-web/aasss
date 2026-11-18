// M4-pattern carbine built from beveled, extruded side profiles. Gun space: barrel along -Z, X right, Y up,
// origin above the pistol grip, sight axis at y = 0.103 (ADS lines up on it). Shared by the viewmodel and soldiers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldUV, photo } from './textures.js';

// Side profile drawn as (u forward, v up), extruded across the gun's width w.
function side(shapeOrPts, w, bevel = 0.0022) {
  const s = shapeOrPts instanceof THREE.Shape ? shapeOrPts : new THREE.Shape(shapeOrPts.map(([u, v]) => new THREE.Vector2(u, v)));
  const d = Math.max(0.001, w - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 })
    .translate(0, 0, -d / 2).rotateY(Math.PI / 2);
  const n = g.attributes.normal, wr = new Float32Array(n.count); // flat normals: bevel faces lean between the caps (+-X) and the walls
  for (let i = 0; i < n.count; i++) wr[i] = Math.abs(n.getX(i)) > 0.15 && Math.abs(n.getX(i)) < 0.95 ? 1 : 0;
  return g.setAttribute('aWear', new THREE.BufferAttribute(wr, 1));
}
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const cylZ = (r0, r1, len, x, y, z, seg = 18) => new THREE.CylinderGeometry(r0, r1, len, seg).rotateX(Math.PI / 2).translate(x, y, z);
const cylX = (r, len, x, y, z) => new THREE.CylinderGeometry(r, r, len, 10).rotateZ(Math.PI / 2).translate(x, y, z);
function rrect(path, x, y, w, h, r) {
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r); path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h); path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}

// Rubbed edges: bevel faces (aWear) wear through to brighter, smoother bare finish in patches broken up by the scan's grain.
function wear(mat, color, k) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aWear;\nvarying float vWear;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vWear = aWear;');
    sh.fragmentShader = 'varying float vWear;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
  float wearK = vWear * ${k.toFixed(2)};
  #ifdef USE_MAP
    wearK *= smoothstep(0.54, 0.7, texture2D(map, vMapUv * 2.7).g); // linear: the scan averages ~0.6
  #endif
  diffuseColor.rgb = mix(diffuseColor.rgb, ${color}, wearK);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  #ifdef USE_MAP
    roughnessFactor *= 0.7 + 0.6 * texture2D(map, vMapUv * 0.21).g; // big, soft smudges from handling
  #endif
  roughnessFactor = mix(roughnessFactor, 0.3, wearK);`)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = mix(metalnessFactor, 0.9, wearK * metalnessFactor * 2.0);');
  };
  mat.customProgramCacheKey = () => `wear${color}${k}`; // same closure text for every material, so key on the constants
}
let mats = null;
export function rifleMaterials() {
  if (mats) return mats;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  mats = {
    metal: std({ color: 0x2e3033, roughness: 0.45, metalness: 0.5 }),
    poly: std({ color: 0x18191b, roughness: 0.8, metalness: 0.04, normalScale: new THREE.Vector2(2, 2) }),
    steel: std({ color: 0xa0a3a7, roughness: 0.26, metalness: 0.95 }),
    rubber: std({ color: 0x0d0d0e, roughness: 0.95 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050506 }),
  };
  // scanned finishes replace the flat ones once loaded: scratched black anodizing, stippled polymer, bare steel
  photo(mats.metal, 'gunmetal', 1, 0x3a3c40, 0.7); photo(mats.poly, 'polymer', 1, 0x2a2b2e, 1.8);
  photo(mats.steel, 'steel', 1, 0xb4b8bd); photo(mats.rubber, 'polymer', 1, 0x18181a, 2.3);
  wear(mats.metal, 'vec3(0.3, 0.31, 0.33)', 1); wear(mats.poly, 'vec3(0.09)', 0.6);
  return mats;
}

// Metres per texture repeat for each finish: UVs are box-projected in gun space so every part gets the same texel density.
const TILE = { metal: 0.15, poly: 0.08, steel: 0.1, rubber: 0.08, dark: 0.1 };
// [{geo, mat, name}] — name 'bolt' and 'mag' parts animate; 'holo' parts make up the sight.
export function rifleParts() {
  const P = [], put = (geo, mat, name) => {
    if (!geo.attributes.aWear) geo.setAttribute('aWear', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count), 1)); // merge needs it on every part
    P.push({ geo: worldUV(geo, TILE[mat]), mat, name });
  };
  // receivers
  put(side([[-0.09, 0.012], [0.14, 0.012], [0.14, 0.05], [0.03, 0.052], [-0.07, 0.052], [-0.09, 0.045]], 0.044), 'metal');
  put(side([[-0.085, 0.012], [0.12, 0.012], [0.12, -0.004], [0.073, -0.004], [0.076, -0.05], [0.069, -0.058], [-0.004, -0.058], [-0.008, -0.013],
    [-0.058, -0.013], [-0.078, -0.005], [-0.085, 0.004]], 0.038), 'metal');
  // flat-top rail with cross slots
  put(box(0.022, 0.008, 0.525, 0, 0.056, -0.188), 'metal');
  const teeth = [];
  for (let u = -0.07; u < 0.45; u += 0.01) teeth.push(box(0.023, 0.004, 0.0052, 0, 0.0618, -u));
  put(mergeGeometries(teeth), 'metal');
  put(cylZ(0.0075, 0.0075, 0.032, 0.025, 0.032, 0.03), 'metal'); // forward assist
  put(box(0.0016, 0.017, 0.052, 0.0226, 0.031, 0.0), 'dark'); // ejection port
  put(box(0.0045, 0.012, 0.046, 0.0225, 0.031, 0.0), 'steel', 'bolt');
  put(box(0.006, 0.012, 0.012, 0.024, 0.04, 0.032), 'metal'); // brass deflector
  put(box(0.034, 0.007, 0.016, 0, 0.05, 0.096), 'metal'); // charging handle
  put(box(0.006, 0.004, 0.054, 0, -0.037, 0.034), 'metal'); // trigger guard
  put(box(0.006, 0.026, 0.004, 0, -0.025, 0.06), 'metal');
  put(new THREE.BoxGeometry(0.004, 0.02, 0.004).rotateX(0.35).translate(0, -0.022, 0.03), 'steel'); // trigger
  put(cylX(0.005, 0.008, 0.021, -0.012, -0.004), 'metal'); // mag release
  put(box(0.004, 0.006, 0.016, -0.0205, 0.002, 0.056), 'metal'); // selector
  put(side([[-0.052, -0.006], [-0.024, -0.006], [-0.032, -0.055], [-0.047, -0.106], [-0.074, -0.11], [-0.079, -0.094], [-0.067, -0.045]], 0.03, 0.003), 'poly'); // pistol grip
  // buffer tube, castle nut, stock and butt pad
  put(cylZ(0.0145, 0.0145, 0.19, 0, 0.027, 0.18), 'metal');
  put(cylZ(0.017, 0.017, 0.012, 0, 0.027, 0.091, 8), 'metal');
  put(side([[-0.17, 0.043], [-0.318, 0.043], [-0.334, 0.027], [-0.334, -0.062], [-0.318, -0.068], [-0.258, -0.021], [-0.172, -0.005]], 0.042, 0.003), 'poly');
  put(side([[-0.334, 0.031], [-0.347, 0.031], [-0.347, -0.064], [-0.334, -0.062]], 0.044, 0.002), 'rubber');
  // free-float octagonal handguard with M-LOK slots, barrel and birdcage flash hider
  put(new THREE.CylinderGeometry(0.0275, 0.0275, 0.31, 8).rotateY(Math.PI / 8).rotateX(Math.PI / 2).translate(0, 0.03, -0.295), 'metal');
  const slots = [];
  for (let k = 0; k < 5; k++) {
    const z = -0.18 - k * 0.055;
    slots.push(box(0.002, 0.008, 0.032, 0.0258, 0.03, z), box(0.002, 0.008, 0.032, -0.0258, 0.03, z), box(0.008, 0.002, 0.032, 0, 0.0042, z));
  }
  put(mergeGeometries(slots), 'dark');
  put(cylZ(0.0095, 0.0095, 0.16, 0, 0.03, -0.52), 'metal');
  put(cylZ(0.0115, 0.0115, 0.05, 0, 0.03, -0.62, 16), 'metal');
  const fh = [];
  for (let k = 0; k < 4; k++) fh.push(new THREE.BoxGeometry(0.003, 0.0022, 0.028).translate(0, 0.0112, 0).rotateZ(k * Math.PI / 2 + Math.PI / 4).translate(0, 0.03, -0.615));
  put(mergeGeometries(fh), 'dark');
  put(box(0.016, 0.01, 0.026, 0, 0.066, -0.43), 'metal'); // folded front sight
  put(box(0.02, 0.01, 0.022, 0, 0.066, 0.075), 'metal'); // folded rear sight
  // curved 30-round magazine and its base plate
  const m = new THREE.Shape();
  m.moveTo(0.001, -0.052); m.lineTo(0.067, -0.052); m.quadraticCurveTo(0.074, -0.13, 0.096, -0.203); m.lineTo(0.036, -0.21); m.quadraticCurveTo(0.014, -0.13, 0.001, -0.052);
  put(side(m, 0.026, 0.002), 'poly', 'mag');
  put(side([[0.033, -0.207], [0.1, -0.199], [0.102, -0.213], [0.034, -0.221]], 0.03, 0.002), 'poly', 'mag');
  for (const v of [-0.09, -0.14]) put(new THREE.BoxGeometry(0.028, 0.004, 0.06).rotateX(-0.15).translate(0, v, -0.042 + (v + 0.09) * -0.3), 'poly', 'mag');
  // holographic sight: rail base, hooded window frame (hole centred on y 0.103), buttons, QD lever
  put(box(0.034, 0.017, 0.078, 0, 0.0715, -0.05), 'metal', 'holo');
  const hood = rrect(new THREE.Shape(), -0.025, 0.08, 0.05, 0.046, 0.007);
  hood.holes.push(rrect(new THREE.Path(), -0.0185, 0.088, 0.037, 0.03, 0.003));
  put(new THREE.ExtrudeGeometry(hood, { depth: 0.054, bevelEnabled: true, bevelThickness: 0.0016, bevelSize: 0.0016, bevelSegments: 2, curveSegments: 6 }).translate(0, 0, -0.086), 'metal', 'holo');
  for (const z of [-0.042, -0.056]) put(box(0.004, 0.008, 0.009, -0.0262, 0.091, z), 'rubber', 'holo');
  put(box(0.006, 0.01, 0.022, 0.0195, 0.072, -0.06), 'metal', 'holo');
  return P;
}

let merged = null;
// Whole rifle as one geometry (third-person soldiers).
export function mergedRifle() {
  if (!merged) merged = mergeGeometries(rifleParts().map((p) => (p.geo.index ? p.geo.toNonIndexed() : p.geo)).map((g) => { g.deleteAttribute('uv'); return g; }));
  return merged;
}
