// Procedural canvas textures: no image files ship with the game.
import * as THREE from 'three';

export const canvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
let seed = 20261117;
export const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Tileable value-noise fBm: random grids scaled up through repeating patterns.
function noise(size, octaves = 5, base = 4, lo = 0, hi = 255) {
  const c = canvas(size), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, size, size);
  for (let o = 0; o < octaves; o++) {
    const cells = base << o, s = canvas(cells), sg = s.getContext('2d'), id = sg.createImageData(cells, cells);
    for (let i = 0; i < id.data.length; i += 4) { const v = lo + rnd() * (hi - lo); id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
    sg.putImageData(id, 0, 0);
    g.save();
    g.globalAlpha = o === 0 ? 1 : 0.55 / o;
    g.imageSmoothingEnabled = true;
    const k = size / cells;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = g.createPattern(s, 'repeat');
    g.fillRect(0, 0, cells, cells);
    g.restore();
  }
  return c;
}

function normalFrom(hc, strength) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h), og = out.getContext('2d'), id = og.createImageData(w, h), d = id.data;
  for (let y = 0; y < h; y++) {
    const ym = ((y - 1 + h) % h) * w, yp = ((y + 1) % h) * w, yr = y * w;
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w, xp = (x + 1) % w;
      const nx = (src[(yr + xm) * 4] - src[(yr + xp) * 4]) / 255 * strength;
      const ny = (src[(yp + x) * 4] - src[(ym + x) * 4]) / 255 * strength;
      const l = Math.hypot(nx, ny, 1), i = (yr + x) * 4;
      d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }
  og.putImageData(id, 0, 0);
  return out;
}

function tex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

// Re-derive UVs from position (box projection along the dominant normal) so tiling textures keep real-world scale on any shape.
export function worldUV(g, tile) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay > 0.5) uv.setXY(i, x / tile, z / tile); else if (ax > 0.5) uv.setXY(i, z / tile, y / tile); else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return g;
}
// CC0 photo set (Poly Haven / ambientCG, built by tools/textures.py) swapped in once loaded; offline or on error the
// canvas textures stay. repeat converts the geometry's UV tile size to the scan's real size; rough scales the scan's roughness.
export function photo(mat, name, repeat, color, rough = 1) {
  const L = new THREE.TextureLoader(), get = (k) => new Promise((res) => L.load(`assets/tex/${name}_${k}.jpg`, res, undefined, () => res(null)));
  Promise.all(['col', 'nrm', 'rgh'].map(get)).then(([map, normalMap, roughnessMap]) => {
    if (!map || !normalMap || !roughnessMap) return;
    for (const t of [map, normalMap, roughnessMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.setScalar(repeat); t.anisotropy = 8; }
    map.colorSpace = THREE.SRGBColorSpace;
    Object.assign(mat, { map, normalMap, roughnessMap, roughness: rough, needsUpdate: true }); mat.color.set(color);
  });
}

// Brick wall set. Tile = 1.8 m: 24 courses of 7.5 cm, 8 bricks of 22.5 cm, running bond.
export function brickSet(style) {
  const P = [
    { b: [205, 186, 150], v: 0.08, m: [186, 180, 168], grime: 1.3 },
    { b: [218, 204, 176], v: 0.07, m: [196, 190, 178], grime: 1 },
    { b: [126, 62, 46], v: 0.18, m: [150, 140, 128], grime: 0.8 },
    { b: [186, 160, 120], v: 0.12, m: [172, 164, 150], grime: 1.6 },
  ][style];
  const S = 1024, rows = 24, cols = 8, bw = S / cols, bh = S / rows, m = 6;
  const A = canvas(S), H = canvas(S), a = A.getContext('2d'), h = H.getContext('2d');
  const n1 = noise(S, 6, 8), n2 = noise(S, 4, 32);
  a.fillStyle = rgb(...P.m); a.fillRect(0, 0, S, S);
  h.fillStyle = rgb(70, 70, 70); h.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw / 2;
    for (let c = -1; c <= cols; c++) {
      const x = c * bw + off + m / 2, y = r * bh + m / 2, w = bw - m, hh = bh - m;
      const k = 1 + (rnd() - 0.5) * 2 * P.v, burnt = rnd() < 0.12 ? 0.7 : 1;
      a.fillStyle = rgb(P.b[0] * k * burnt, P.b[1] * k * burnt * (0.95 + rnd() * 0.1), P.b[2] * k * burnt);
      a.fillRect(x, y, w, hh);
      const hv = 190 + rnd() * 40;
      h.fillStyle = rgb(hv, hv, hv); h.fillRect(x, y, w, hh);
      h.strokeStyle = rgb(hv - 55, hv - 55, hv - 55); h.lineWidth = 3; h.strokeRect(x + 1.5, y + 1.5, w - 3, hh - 3);
      if (rnd() < 0.25) { // chipped corner
        const cx = x + (rnd() < 0.5 ? 0 : w), cy = y + (rnd() < 0.5 ? 0 : hh), cr = 3 + rnd() * 7;
        h.fillStyle = rgb(90, 90, 90); h.beginPath(); h.arc(cx, cy, cr, 0, 7); h.fill();
        a.fillStyle = rgb(...P.m.map((v) => v * 0.8)); a.beginPath(); a.arc(cx, cy, cr, 0, 7); a.fill();
      }
    }
  }
  a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.55; a.drawImage(n2, 0, 0); a.globalAlpha = 0.45; a.drawImage(n1, 0, 0);
  a.globalCompositeOperation = 'source-over';
  if (P.paint) { // flaking paint over the brick
    const pc = canvas(S), pg = pc.getContext('2d'), nd = n1.getContext('2d').getImageData(0, 0, S, S), pd = pg.createImageData(S, S);
    for (let i = 0; i < pd.data.length; i += 4) {
      const v = nd.data[i]; pd.data[i] = P.paint[0]; pd.data[i + 1] = P.paint[1]; pd.data[i + 2] = P.paint[2];
      pd.data[i + 3] = v > 108 ? 235 : v > 98 ? 120 : 0;
    }
    pg.putImageData(pd, 0, 0);
    a.drawImage(pc, 0, 0);
    a.globalCompositeOperation = 'multiply'; a.globalAlpha = 0.35; a.drawImage(n2, 0, 0);
    a.globalCompositeOperation = 'source-over';
  }
  for (let i = 0; i < 70 * P.grime; i++) { // soot and water streaks
    const x = rnd() * S, w = 2 + rnd() * 14, y = rnd() * S * 0.6, len = 120 + rnd() * 500;
    const gr = a.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, rgb(40, 32, 24, 0)); gr.addColorStop(0.2, rgb(40, 32, 24, 0.06 + rnd() * 0.12)); gr.addColorStop(1, rgb(40, 32, 24, 0));
    a.fillStyle = gr; a.globalAlpha = 1; a.fillRect(x, y, w, len); a.fillRect(x - S, y, w, len);
  }
  a.globalAlpha = 1;
  h.globalCompositeOperation = 'multiply'; h.globalAlpha = 0.6; h.drawImage(n2, 0, 0); h.globalCompositeOperation = 'source-over'; h.globalAlpha = 1;
  const R = canvas(256), rg = R.getContext('2d');
  rg.fillStyle = rgb(225, 225, 225); rg.fillRect(0, 0, 256, 256);
  rg.globalAlpha = 0.5; rg.drawImage(n1, 0, 0, 256, 256);
  return { map: tex(A, true), normalMap: tex(normalFrom(H, 2.2), false), roughnessMap: tex(R, false) };
}

// Grime on facades (alpha only): four 2.6 m wide strips of soot and rain streaks hanging from the roof line.
export function streakTex() {
  const W = 1024, H = 1024, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) for (let i = 0, n = 7 + rnd() * 9; i < n; i++) {
    const x = k * 256 + 8 + rnd() * 240, w = 2 + rnd() * rnd() * 22, y = rnd() < 0.7 ? rnd() * 40 : rnd() * H * 0.6, len = H * (0.15 + rnd() * 0.65), a = 0.25 + rnd() * 0.45;
    const gr = g.createLinearGradient(0, y, 0, y + len);
    gr.addColorStop(0, rgb(255, 255, 255, 0)); gr.addColorStop(0.06, rgb(255, 255, 255, a)); gr.addColorStop(1, rgb(255, 255, 255, 0));
    g.fillStyle = gr; g.fillRect(x, y, w, len); g.fillRect(x + w * 0.3, y, w * 0.4, len * 1.15);
  }
  const top = g.createLinearGradient(0, 0, 0, 90); top.addColorStop(0, rgb(255, 255, 255, 0.35)); top.addColorStop(1, rgb(255, 255, 255, 0));
  g.fillStyle = top; g.fillRect(0, 0, W, 90);
  g.globalCompositeOperation = 'multiply'; g.drawImage(noise(W, 5, 8, 120, 255), 0, 0);
  return tex(c, false, false);
}

// Patchy packed snow over wet roofing tar. Tile = 8 m. Returns color, normal and roughness (wet tar is glossy).
export function snowSet() {
  const S = 1024, H = noise(S, 6, 6), A = canvas(S), a = A.getContext('2d');
  const hg = H.getContext('2d'), mask = noise(S, 5, 3).getContext('2d').getImageData(0, 0, S, S).data, grain = noise(S, 3, 64).getContext('2d').getImageData(0, 0, S, S).data;
  for (let i = 0; i < 260; i++) { // boot prints and lumps
    const x = rnd() * S, y = rnd() * S, r = 6 + rnd() * 18;
    hg.fillStyle = rnd() < 0.6 ? 'rgba(60,60,60,0.25)' : 'rgba(255,255,255,0.25)';
    hg.beginPath(); hg.ellipse(x, y, r, r * (0.4 + rnd() * 0.5), rnd() * 3, 0, 7); hg.fill();
  }
  const hd = hg.getImageData(0, 0, S, S).data, id = a.createImageData(S, S), d = id.data;
  const R = canvas(S), rg = R.getContext('2d'), rd = rg.createImageData(S, S);
  for (let i = 0; i < d.length; i += 4) {
    const v = hd[i] / 255, m = mask[i] / 255 + (grain[i] / 255 - 0.5) * 0.12;
    const s = Math.min(1, Math.max(0, (m - 0.4) / 0.12)); // snow coverage
    const tar = 46 + 20 * v, slush = s < 1 && s > 0 ? 1 - Math.abs(s - 0.5) * 2 : 0;
    d[i] = tar + (214 + 40 * v - tar) * s + slush * 30; d[i + 1] = tar + 2 + (220 + 34 * v - tar) * s + slush * 32; d[i + 2] = tar + 6 + (232 + 23 * v - tar) * s + slush * 36; d[i + 3] = 255;
    const r = 70 + 120 * s + 30 * v; rd.data[i] = rd.data[i + 1] = rd.data[i + 2] = r; rd.data[i + 3] = 255;
  }
  a.putImageData(id, 0, 0); rg.putImageData(rd, 0, 0);
  return { map: tex(A, true), normalMap: tex(normalFrom(H, 1.6), false), roughnessMap: tex(R, false) };
}

// Distant tower facades: a 4x4 grid of window modules. kind: 0 blue glass, 1 cream stone, 2 gray concrete, 3 brick mid-rise
export function facadeTex(kind) {
  const S = 1024, c = canvas(S), g = c.getContext('2d'), m = S / 4; // one window bay (3.5 m) per 256 px
  const base = [[38, 52, 70], [206, 194, 168], [150, 152, 150], [150, 86, 62]][kind];
  g.fillStyle = rgb(...base); g.fillRect(0, 0, S, S);
  if (kind) for (let y = 0; y < S; y += 9) { g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, y, S, 2); } // masonry coursing
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const k = 0.75 + rnd() * 0.35, px = x * m, py = y * m;
    if (kind === 0) { // curtain wall: tinted glass, mullions, a bright spandrel band, some blinds drawn
      const gr = g.createLinearGradient(px, py, px + m, py + m);
      gr.addColorStop(0, rgb(70 * k, 100 * k, 135 * k)); gr.addColorStop(1, rgb(30 * k, 45 * k, 66 * k));
      g.fillStyle = gr; g.fillRect(px + 4, py + 4, m - 8, m - 8);
      if (rnd() < 0.3) { g.fillStyle = 'rgba(205,210,215,0.35)'; g.fillRect(px + 4, py + 4, m - 8, (m - 8) * (0.2 + rnd() * 0.5)); }
      g.fillStyle = 'rgba(200,215,230,0.5)'; g.fillRect(px, py + m * 0.62, m, 7);
      g.fillStyle = 'rgba(18,24,32,0.9)'; for (const f of [1 / 3, 2 / 3]) g.fillRect(px + m * f - 2, py, 4, m);
    } else { // punched windows: dark glass with sky reflection, centre mullion, stone sill
      const w = kind === 2 ? m - 20 : m * 0.42, h = kind === 2 ? m * 0.36 : m * 0.6, wx = px + (m - w) / 2, wy = py + m * 0.22;
      g.fillStyle = rgb(26 * k, 32 * k, 40 * k); g.fillRect(wx, wy, w, h);
      g.fillStyle = 'rgba(160,180,200,0.25)'; g.fillRect(wx, wy, w, h * 0.35);
      if (rnd() < 0.35) { g.fillStyle = 'rgba(200,196,186,0.4)'; g.fillRect(wx, wy, w, h * (0.15 + rnd() * 0.5)); }
      g.fillStyle = rgb(base[0] * 0.35, base[1] * 0.35, base[2] * 0.35); g.fillRect(wx + w / 2 - 3, wy, 6, h); g.fillRect(wx - 3, wy - 3, w + 6, 6);
      g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(wx - 8, wy + h, w + 16, 8);
    }
  }
  g.globalCompositeOperation = 'multiply'; g.drawImage(noise(S, 5, 4), 0, 0);
  return tex(c, true);
}
// Vertical wood staves with iron hoops, for rooftop water tanks.
export function stavesTex() {
  const S = 256, c = canvas(S), g = c.getContext('2d');
  for (let x = 0; x < S; x += 16) { const k = 0.8 + rnd() * 0.3; g.fillStyle = rgb(92 * k, 70 * k, 52 * k); g.fillRect(x, 0, 15, S); g.fillStyle = 'rgba(25,18,12,0.8)'; g.fillRect(x + 15, 0, 1, S); }
  g.globalCompositeOperation = 'multiply'; g.drawImage(noise(S, 5, 4), 0, 0);
  return tex(c, true);
}
// Lit-from-outside window: dark room behind half-open blinds.
export function blindsTex() {
  const c = canvas(128, 192), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, '#2c2c2e'); gr.addColorStop(1, '#141416');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 192);
  const drop = 40 + rnd() * 90;
  for (let y = 0; y < drop; y += 6) { g.fillStyle = 'rgba(205,200,190,0.9)'; g.fillRect(0, y, 128, 4); }
  return tex(c, true, false);
}

// Wheel ruts of wet slush down the alley: RGBA strip, tiles along its length.
export function slushTex() {
  const W = 256, L = 1024, c = canvas(W, L), g = c.getContext('2d');
  const n = noise(256, 5, 8);
  for (const cx of [62, 194]) {
    for (let y = 0; y < L; y += 2) {
      const wob = Math.sin(y * 0.01 + cx) * 6 + (rnd() - 0.5) * 5, w = 34 + rnd() * 10;
      const gr = g.createLinearGradient(cx + wob - w, 0, cx + wob + w, 0);
      gr.addColorStop(0, 'rgba(70,72,74,0)'); gr.addColorStop(0.3, 'rgba(58,60,62,0.75)'); gr.addColorStop(0.5, 'rgba(40,42,44,0.9)');
      gr.addColorStop(0.7, 'rgba(58,60,62,0.75)'); gr.addColorStop(1, 'rgba(70,72,74,0)');
      g.fillStyle = gr; g.fillRect(cx + wob - w, y, w * 2, 2);
    }
  }
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.5;
  for (let y = 0; y < L; y += 256) g.drawImage(n, 0, y);
  return tex(c, true);
}

export function concreteSet() {
  const S = 512, n = noise(S, 6, 4), c = canvas(S), g = c.getContext('2d');
  g.fillStyle = '#8a8a86'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply'; g.drawImage(n, 0, 0); g.drawImage(noise(S, 3, 32), 0, 0);
  g.globalCompositeOperation = 'source-over';
  return { map: tex(c, true), normalMap: tex(normalFrom(noise(S, 4, 32), 0.8), false) };
}

// Painted steel with rust blooms. color: [r,g,b]
export function paintedMetal(color, blooms = 40) {
  const S = 512, n = noise(S, 6, 4), c = canvas(S), g = c.getContext('2d');
  g.fillStyle = rgb(...color); g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.6; g.drawImage(n, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (let i = 0; i < blooms; i++) {
    const x = rnd() * S, y = rnd() * S, r = 4 + rnd() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(92,46,22,0.85)'); gr.addColorStop(1, 'rgba(92,46,22,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  return tex(c, true);
}

export function woodTex() {
  const S = 512, c = canvas(S), g = c.getContext('2d');
  for (let p = 0; p < 6; p++) {
    const y = p * S / 6, k = 0.8 + rnd() * 0.3;
    g.fillStyle = rgb(150 * k, 112 * k, 70 * k); g.fillRect(0, y, S, S / 6 - 4);
    for (let i = 0; i < 40; i++) { g.fillStyle = rgb(90, 62, 36, 0.15 + rnd() * 0.2); g.fillRect(0, y + rnd() * (S / 6 - 4), S, 1 + rnd() * 2); }
    g.fillStyle = 'rgba(30,20,12,0.9)'; g.fillRect(0, y + S / 6 - 4, S, 4);
  }
  g.globalCompositeOperation = 'multiply'; g.drawImage(noise(S, 5, 4), 0, 0);
  return tex(c, true);
}

// Corrugated steel (gate, garage doors): returns color + normal.
export function corrugated(color, horizontal = false) {
  const S = 256, c = canvas(S), g = c.getContext('2d'), h = canvas(S), hg = h.getContext('2d');
  for (let x = 0; x < S; x++) { const v = 128 + 110 * Math.sin(x / S * Math.PI * 2 * 8); hg.fillStyle = rgb(v, v, v); if (horizontal) hg.fillRect(0, x, S, 1); else hg.fillRect(x, 0, 1, S); }
  g.fillStyle = rgb(...color); g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'multiply'; g.drawImage(noise(S, 5, 4), 0, 0);
  return { map: tex(c, true), normalMap: tex(normalFrom(h, 3), false) };
}

export function chainLink() {
  const S = 128, c = canvas(S), g = c.getContext('2d');
  g.strokeStyle = 'rgba(150,155,160,1)'; g.lineWidth = 5;
  for (let k = -S; k <= S * 2; k += S / 4) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + S, S); g.stroke();
    g.beginPath(); g.moveTo(k + S, 0); g.lineTo(k, S); g.stroke();
  }
  return tex(c, true);
}

// Lit window interior seen through blinds.
export function windowTex() {
  const c = canvas(128, 192), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 192);
  gr.addColorStop(0, '#fff3d6'); gr.addColorStop(1, '#a8743c');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 192);
  g.fillStyle = 'rgba(60,40,20,0.35)';
  for (let y = 0; y < 120; y += 7) g.fillRect(0, y, 128, 3);
  g.fillStyle = 'rgba(30,20,10,0.55)'; g.fillRect(10, 130, 40, 62); g.fillRect(78, 150, 50, 42);
  return tex(c, true, false);
}

export function softDot() {
  const S = 64, c = canvas(S), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return tex(c, false, false);
}

export function flashTex() {
  const S = 128, c = canvas(S), g = c.getContext('2d');
  g.translate(64, 64);
  for (let i = 0; i < 9; i++) {
    g.rotate(Math.PI * 2 / 9 + rnd() * 0.3);
    const len = 30 + rnd() * 34, gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.5, 'rgba(255,170,60,0.7)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -5); g.lineTo(len, 0); g.lineTo(0, 5); g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, 26);
  core.addColorStop(0, 'rgba(255,255,240,1)'); core.addColorStop(0.5, 'rgba(255,200,110,0.8)'); core.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = core; g.fillRect(-26, -26, 52, 52);
  return tex(c, false, false);
}

export function bulletHole() {
  const S = 128, c = canvas(S), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 60);
  gr.addColorStop(0, 'rgba(8,6,5,1)'); gr.addColorStop(0.12, 'rgba(10,8,7,1)'); gr.addColorStop(0.2, 'rgba(40,34,30,0.9)');
  gr.addColorStop(0.45, 'rgba(70,62,56,0.45)'); gr.addColorStop(1, 'rgba(90,80,72,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.strokeStyle = 'rgba(20,16,14,0.7)'; g.lineWidth = 1.5;
  for (let i = 0; i < 7; i++) { const a = rnd() * 7, r = 14 + rnd() * 26; g.beginPath(); g.moveTo(64 + Math.cos(a) * 8, 64 + Math.sin(a) * 8); g.lineTo(64 + Math.cos(a + 0.2) * r, 64 + Math.sin(a + 0.2) * r); g.stroke(); }
  return tex(c, true, false);
}

// Blood spatter: dense core, droplets thrown outward, a few streaks.
export function splatter(S = 256, dark = false) {
  const c = canvas(S), g = c.getContext('2d'), m = S / 2;
  const col = () => dark ? rgb(70 + rnd() * 40, 0, 2, 0.9) : rgb(110 + rnd() * 60, 4 + rnd() * 8, 6, 0.85 + rnd() * 0.15);
  for (let i = 0; i < 18; i++) {
    const a = rnd() * 7, r = rnd() * S * 0.12, x = m + Math.cos(a) * r, y = m + Math.sin(a) * r;
    g.fillStyle = col(); g.beginPath(); g.arc(x, y, S * (0.04 + rnd() * 0.07), 0, 7); g.fill();
  }
  for (let i = 0; i < 90; i++) {
    const a = rnd() * 7, r = S * (0.12 + Math.pow(rnd(), 0.7) * 0.36), x = m + Math.cos(a) * r, y = m + Math.sin(a) * r;
    g.fillStyle = col(); g.beginPath(); g.arc(x, y, Math.max(0.8, S * 0.02 * (1 - r / (S * 0.5)) * rnd()), 0, 7); g.fill();
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * 7, r0 = S * 0.1, r1 = S * (0.2 + rnd() * 0.25);
    g.strokeStyle = col(); g.lineWidth = 1 + rnd() * S * 0.012; g.lineCap = 'round';
    g.beginPath(); g.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); g.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1); g.stroke();
  }
  return c;
}

// Blood on the lens: soft dark smears with droplets and a few drips running down.
export function screenSplat(S = 384) {
  const c = canvas(S), g = c.getContext('2d'), m = S / 2;
  g.filter = 'blur(1.4px)';
  for (let i = 0; i < 7; i++) {
    const a = rnd() * 7, r = rnd() * S * 0.12, x = m + Math.cos(a) * r, y = m + Math.sin(a) * r, rr = S * (0.05 + rnd() * 0.08);
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(58,0,2,0.9)'); gr.addColorStop(0.65, 'rgba(98,3,6,0.72)'); gr.addColorStop(1, 'rgba(110,5,8,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  for (let i = 0; i < 70; i++) {
    const a = rnd() * 7, r = S * (0.1 + Math.pow(rnd(), 0.8) * 0.36), rr = Math.max(0.8, S * 0.014 * (1 - r / (S * 0.5)) * (0.4 + rnd()));
    g.fillStyle = rgb(70 + rnd() * 45, 0, 3, 0.55 + rnd() * 0.35); g.beginPath(); g.arc(m + Math.cos(a) * r, m + Math.sin(a) * r, rr, 0, 7); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    let x = m + (rnd() - 0.5) * S * 0.2, y = m + rnd() * S * 0.05, w = S * (0.012 + rnd() * 0.012);
    const len = S * (0.12 + rnd() * 0.25);
    for (let s = 0; s < len; s += 3) { g.strokeStyle = 'rgba(75,0,3,0.8)'; g.lineWidth = w * (1 - s / len * 0.7); g.beginPath(); g.moveTo(x, y); x += (rnd() - 0.5) * 1.5; y += 3; g.lineTo(x, y); g.stroke(); }
    g.fillStyle = 'rgba(70,0,3,0.85)'; g.beginPath(); g.arc(x, y, w * 0.7, 0, 7); g.fill();
  }
  return c;
}

export function neonTex(text, color, vertical) {
  const W = vertical ? 160 : 512, H = vertical ? 640 : 192, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
  g.font = `700 ${vertical ? 104 : 140}px "Big Shoulders Display", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const hex = '#' + color.toString(16).padStart(6, '0');
  const letters = vertical ? [...text] : [text];
  letters.forEach((ch, i) => {
    const x = W / 2, y = vertical ? (i + 0.5) * H / letters.length : H / 2;
    g.shadowColor = hex; g.shadowBlur = 28; g.fillStyle = hex; g.fillText(ch, x, y);
    g.shadowBlur = 0; g.fillStyle = '#ffe9f0'; g.fillText(ch, x, y);
  });
  return tex(c, true, false);
}
