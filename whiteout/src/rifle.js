// M4-pattern carbine built from beveled, extruded side profiles. Gun space: barrel along -Z, X right, Y up,
// origin above the pistol grip, sight axis at y = 0.103 (ADS lines up on it). Shared by the viewmodel and soldiers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvas, rnd } from './textures.js';

// Side profile drawn as (u forward, v up), extruded across the gun's width w.
function side(shapeOrPts, w, bevel = 0.0015) {
  const s = shapeOrPts instanceof THREE.Shape ? shapeOrPts : new THREE.Shape(shapeOrPts.map(([u, v]) => new THREE.Vector2(u, v)));
  const d = Math.max(0.001, w - bevel * 2);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 })
    .translate(0, 0, -d / 2).rotateY(Math.PI / 2);
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

let mats = null;
// Worn cerakote: scratches and rubbed edges show brighter, smoother metal.
export function rifleMaterials() {
  if (mats) return mats;
  const S = 512, c = canvas(S), g = c.getContext('2d'), r = canvas(S), rg = r.getContext('2d');
  g.fillStyle = '#26272a'; g.fillRect(0, 0, S, S); rg.fillStyle = '#a0a0a0'; rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, rr = 6 + rnd() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(70,70,74,0.35)'); gr.addColorStop(1, 'rgba(70,70,74,0)');
    g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    const rgr = rg.createRadialGradient(x, y, 0, x, y, rr); rgr.addColorStop(0, 'rgba(90,90,90,0.5)'); rgr.addColorStop(1, 'rgba(90,90,90,0)');
    rg.fillStyle = rgr; rg.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < 320; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI, l = 3 + rnd() * 24;
    g.strokeStyle = `rgba(140,140,146,${0.12 + rnd() * 0.4})`; g.lineWidth = 0.5 + rnd() * 0.9;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    rg.strokeStyle = 'rgba(55,55,55,0.7)'; rg.lineWidth = 1;
    rg.beginPath(); rg.moveTo(x, y); rg.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); rg.stroke();
  }
  const map = new THREE.CanvasTexture(c), rough = new THREE.CanvasTexture(r);
  map.colorSpace = THREE.SRGBColorSpace;
  for (const t of [map, rough]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 7); t.anisotropy = 8; }
  const std = (o) => new THREE.MeshStandardMaterial(o);
  mats = {
    metal: std({ map, roughnessMap: rough, roughness: 1, metalness: 0.5 }),
    poly: std({ color: 0x18191b, roughness: 0.8, metalness: 0.04 }),
    steel: std({ color: 0xa0a3a7, roughness: 0.26, metalness: 0.95 }),
    rubber: std({ color: 0x0d0d0e, roughness: 0.95 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x050506 }),
  };
  return mats;
}

// [{geo, mat, name}] — name 'bolt' and 'mag' parts animate; 'holo' parts make up the sight.
export function rifleParts() {
  const P = [], put = (geo, mat, name) => P.push({ geo, mat, name });
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
