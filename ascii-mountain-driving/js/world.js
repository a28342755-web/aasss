'use strict';
// World: seeded noise, procedural mountain terrain, chunked height map (2 LODs), roads, streams, objects.
// The world is unbounded: chunks are generated around the player and evicted behind them, so there is no edge.
const M = { WATER: 0, ICE: 1, SAND: 2, GRASS: 3, FOREST: 4, ROCK: 5, SNOW: 6, ASPHALT: 7, DIRT: 8, STREAM: 9, FALL: 10, ALPINE: 11, SNOWROAD: 12 };
const sat = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, v) => { v = sat((v - a) / (b - a)); return v * v * (3 - 2 * v); };
const lerp = (a, b, t) => a + (b - a) * t;

const W = (() => {
  let seed = 1;
  const GX = new Float32Array(256), GZ = new Float32Array(256);
  for (let i = 0; i < 256; i++) { GX[i] = Math.cos(i * Math.PI / 128); GZ[i] = Math.sin(i * Math.PI / 128); }
  function hashi(ix, iz, s) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s ^ seed, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  const hash = (ix, iz, s) => hashi(ix, iz, s) / 4294967296;
  function noise(x, z, s) { // gradient noise, roughly [-1, 1]
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    let g = hashi(ix, iz, s) & 255; const a = GX[g] * fx + GZ[g] * fz;
    g = hashi(ix + 1, iz, s) & 255; const b = GX[g] * (fx - 1) + GZ[g] * fz;
    g = hashi(ix, iz + 1, s) & 255; const c = GX[g] * fx + GZ[g] * (fz - 1);
    g = hashi(ix + 1, iz + 1, s) & 255; const d = GX[g] * (fx - 1) + GZ[g] * (fz - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.6;
  }
  function fbm(x, z, o, s) {
    let a = 0, w = 1, t = 0;
    for (let i = 0; i < o; i++) { a += noise(x, z, s + i) * w; t += w; w *= 0.5; x *= 2.03; z *= 2.03; }
    return a / t;
  }
  function ridged(x, z, o, s) { // 0..1, sharp crests; detail concentrates on ridges
    let a = 0, w = 1, t = 0, p = 1;
    for (let i = 0; i < o; i++) {
      let n = 1 - Math.abs(noise(x, z, s + i)); n *= n;
      a += n * w * p; t += w; p = n; w *= 0.5; x *= 2.03; z *= 2.03;
    }
    return a / t;
  }

  // Raw fields at a point. L = smooth landform height, D = small-scale detail (faded out on roads),
  // V = valley field (streams run along V = 0), N1/N2 = road level perturbation, veg = forest density.
  const T = { L: 0, D: 0, V: 0, N1: 0, N2: 0, veg: 0 };
  function terrain(x, z) {
    const wx = x + 180 * noise(x / 1400, z / 1400, 11), wz = z + 180 * noise(x / 1400 + 7.3, z / 1400 - 3.1, 12);
    const cont = fbm(wx / 9000, wz / 9000, 3, 20);                   // lowlands .. highlands
    const alp = sat(noise(wx / 8000, wz / 8000, 30) * 1.8 + 0.45);   // alpine ranges
    const mesa = sat(noise(wx / 4300 + 50, wz / 4300, 40) * 2.4 - 0.65); // terraced cliff country
    const crag = sat(noise(wx / 3100, wz / 3100 + 9, 45) * 2.2 - 0.45); // broken rock country
    const rid = ridged(wx / 5200, wz / 5200, 5, 50);
    const V = noise(wx / 1500, wz / 1500, 60);
    let L = -70 + cont * 300 + Math.sqrt(V * V + 0.003) * 240 + Math.pow(rid, 1.5) * (180 + 1100 * alp) + fbm(wx / 700, wz / 700, 2, 70) * 28;
    if (mesa > 0 && L > 5) { const t = L / 70, ft = Math.floor(t); L += ((ft + sstep(0.25, 0.75, t - ft)) * 70 - L) * mesa; }
    T.L = L; T.V = V;
    T.N1 = noise(x / 2300, z / 2300, 80); T.N2 = noise(x / 1200 + 3, z / 1200, 85);
    T.D = fbm(x / 55, z / 55, 3, 130) * 2.5 + noise(x / 9, z / 9, 135) * 0.25 + crag * (ridged(x / 240, z / 240, 3, 140) - 0.35) * 24;
    T.veg = sat(fbm(x / 800, z / 800, 2, 110) * 1.6 + 0.5);
  }

  const TILT = 0.05;
  const LODS = [{ cell: 2, n: 48 }, { cell: 16, n: 48 }]; // chunk = 96 m (near) / 768 m (far)
  const RAD = [3, 4];                                     // chunk radius kept loaded per LOD
  const chunks = [new Map(), new Map()];
  // shortcut: chunk keys wrap beyond +-32768 chunks (about 3000 km from the origin); widen the key if anyone drives that far
  const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);
  const lastK = [-1, -1], lastC = [null, null];

  // Roads are contour lines of F = L + kN*N + TILT*(x or z), levels every 200 m: they hug the mountainside,
  // stay level across their width and climb gently as N drifts. The tilt keeps F sloped on flat ground, so a
  // road stays a line there instead of smearing into a wide patch. Family 0 = paved, 1 = dirt trail.
  function gen(lod, cx, cz) {
    const { cell, n } = LODS[lod], m = n + 5, n1 = n + 1, ox = cx * n * cell, oz = cz * n * cell;
    const L = new Float32Array(m * m), D = new Float32Array(m * m), V = new Float32Array(m * m);
    const N1 = new Float32Array(m * m), N2 = new Float32Array(m * m), VG = new Float32Array(m * m);
    for (let j = 0, k = 0; j < m; j++) for (let i = 0; i < m; i++, k++) {
      terrain(ox + (i - 2) * cell, oz + (j - 2) * cell);
      L[k] = T.L; D[k] = T.D; V[k] = T.V; N1[k] = T.N1; N2[k] = T.N2; VG[k] = T.veg;
    }
    const H = new Float32Array(m * m), KD = new Uint8Array(m * m), RD = new Int8Array(m * m); // RD: signed distance to the road centre, 1/4 m
    const i2 = 1 / (2 * cell), wmin = cell * 0.5;
    for (let j = 1; j < m - 1; j++) for (let i = 1; i < m - 1; i++) {
      const k = j * m + i; let h = L[k] + D[k], kind = 0, rdist = 31.7, sgn = 1;
      const ds = Math.abs(V[k]) / Math.max(Math.hypot(V[k + 1] - V[k - 1], V[k + m] - V[k - m]) * i2, 1e-6);
      if (L[k] > 0.5) { if (ds < 4) h -= 0.8 * (1 - ds / 4) * (1 - ds / 4); if (ds < Math.max(2.5, wmin)) kind = 3; }
      for (let f = 1; f >= 0; f--) {
        const off = f ? 100 : 0, kN = f ? 130 : 70, Na = f ? N2 : N1, tilt = TILT * (f ? oz + (j - 2) * cell : ox + (i - 2) * cell);
        const Fk = L[k] + kN * Na[k] + tilt - off, lv = Math.round(Fk / 200);
        if (hash(lv, f, 200) < (f ? 0.3 : 0.2)) continue;
        const g = Math.hypot((L[k + 1] + kN * Na[k + 1] - L[k - 1] - kN * Na[k - 1]) * i2 + (f ? 0 : TILT), (L[k + m] + kN * Na[k + m] - L[k - m] - kN * Na[k - m]) * i2 + (f ? TILT : 0));
        const d = Math.abs(Fk - lv * 200) / Math.max(g, 0.03), Hr = lv * 200 + off - kN * Na[k] - tilt;
        if (d > 30 || Hr < 2.5) continue;
        const hw = f ? 2.2 : 3.6, t = sstep(hw, hw + 5 + 9 * Math.min(1, g), d), surf = Hr + (f ? D[k] * 0.2 : 0);
        h = surf + (h - surf) * t;
        if (d < rdist) { rdist = g < 0.08 ? Math.max(d, 1) : d; sgn = Fk < lv * 200 ? -1 : 1; } // flat F: distance unreliable, keep it off the centre line
        if (d < Math.max(hw + 0.8, wmin)) kind = f + 1;
      }
      H[k] = h; KD[k] = kind; RD[k] = Math.round(Math.min(31.7, rdist) * 4) * sgn;
    }
    const c = {
      cx, cz, ox, oz, h: new Float32Array(n1 * n1), gx: new Float32Array(n1 * n1), gz: new Float32Array(n1 * n1),
      kind: new Uint8Array(n1 * n1), rd: new Int8Array(n1 * n1), veg: new Uint8Array(n1 * n1), objs: []
    };
    for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) {
      const k = (j + 2) * m + i + 2, q = j * n1 + i, hh = H[k];
      const gx = (H[k + 1] - H[k - 1]) * i2, gz = (H[k + m] - H[k - m]) * i2, sl = Math.hypot(gx, gz);
      c.h[q] = hh; c.gx[q] = gx; c.gz[q] = gz; c.rd[q] = RD[k];
      c.kind[q] = KD[k] === 3 && sl > 0.5 ? 4 : KD[k];   // steep stream = waterfall
      c.veg[q] = 255 * VG[k] * (1 - sstep(520, 680, hh)) * (1 - sstep(0.5, 0.85, sl)) * (hh < 1.5 || Math.abs(RD[k]) < 24 ? 0 : 1);
    }
    // objects: t 0 pine, 1 broadleaf, 2 dead snag, 3 boulder, 4 bush; s = height (m), r = collision radius
    if (lod === 0) for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
      const r = hashi(cx * 12 + i, cz * 12 + j, 300), ci = i * 4 + (r & 3), cj = j * 4 + (r >> 2 & 3), k = cj * n1 + ci;
      const p = (r >>> 8 & 1023) / 1024, q = (r >>> 18) / 16384, hh = c.h[k], sl = Math.hypot(c.gx[k], c.gz[k]);
      if (hh < 0.4 || Math.abs(c.rd[k]) < 28 || c.kind[k]) continue;
      const v = c.veg[k] / 255; let t, s, rad;
      if (p < v * 0.8) { t = q < 0.04 ? 2 : (r >>> 4 & 15) / 16 < sstep(150, 450, hh) * 0.8 + 0.1 ? 0 : 1; s = t === 2 ? 5 + q * 60 : 7 + q * 9; rad = 0.3 + s * 0.02; }
      else if ((sl > 0.45 || hh > 560) && p > 0.86) { t = 3; s = 0.7 + q * q * 3.2; rad = s * 0.55; }
      else if (p > 0.95) { t = 4; s = 0.8 + q * 1.2; rad = 0; }
      else continue;
      c.objs.push({ x: ox + ci * cell, z: oz + cj * cell, y: hh, t, s, r: rad, q });
    }
    chunks[lod].set(key(cx, cz), c); lastK[lod] = -1;
    return c;
  }

  const api = {
    M, LODS, chunks, hash, hashi, noise, fbm, cur: null, fx: 0, fz: 0,
    get seed() { return seed; },
    chunk(lod, cx, cz) { return chunks[lod].get(key(cx, cz)); },
    reset(s) { seed = s | 0; chunks[0].clear(); chunks[1].clear(); lastK[0] = lastK[1] = -1; },
    // Nearest cell lookup: returns the index into api.cur's arrays (or -1 if that chunk is not loaded).
    at(lod, x, z) {
      const d = LODS[lod], gx = x / d.cell, gz = z / d.cell, ix = Math.floor(gx), iz = Math.floor(gz);
      const cx = Math.floor(ix / d.n), cz = Math.floor(iz / d.n), k = key(cx, cz);
      const c = k === lastK[lod] ? lastC[lod] : (lastK[lod] = k, lastC[lod] = chunks[lod].get(k));
      if (!c) return -1;
      api.cur = c; api.fx = gx - ix; api.fz = gz - iz;
      return (iz - cz * d.n) * (d.n + 1) + (ix - cx * d.n);
    },
    // Smooth ground query for physics; generates the near chunk on demand so there is always ground.
    ground(x, z, o) {
      let i = api.at(0, x, z);
      if (i < 0) { gen(0, Math.floor(x / 96), Math.floor(z / 96)); i = api.at(0, x, z); }
      const c = api.cur, n1 = LODS[0].n + 1, fx = api.fx, fz = api.fz;
      const a = (1 - fx) * (1 - fz), b = fx * (1 - fz), cc = (1 - fx) * fz, d = fx * fz;
      o.h = c.h[i] * a + c.h[i + 1] * b + c.h[i + n1] * cc + c.h[i + n1 + 1] * d;
      o.gx = c.gx[i] * a + c.gx[i + 1] * b + c.gx[i + n1] * cc + c.gx[i + n1 + 1] * d;
      o.gz = c.gz[i] * a + c.gz[i + 1] * b + c.gz[i + n1] * cc + c.gz[i + n1 + 1] * d;
      const j = i + (fx > 0.5 ? 1 : 0) + (fz > 0.5 ? n1 : 0);
      o.c = c; o.i = j; o.kind = c.kind[j]; o.rd = Math.abs(c.rd[j]) / 4; o.veg = c.veg[j];
      return o;
    },
    material(c, i, snowline, frozen) {
      const h = c.h[i], k = c.kind[i];
      if (h < 0) return frozen ? M.ICE : M.WATER;
      const gx = c.gx[i], gz = c.gz[i], sl = Math.sqrt(gx * gx + gz * gz), snow = h + gz * 50 > snowline;
      if (k === 1) return h > snowline + 50 ? M.SNOWROAD : M.ASPHALT;
      if (k === 2) return snow ? M.SNOW : M.DIRT;
      if (k === 3) return frozen ? M.ICE : M.STREAM;
      if (k === 4) return M.FALL;
      if (snow && sl < 1.2) return M.SNOW;
      if (sl > 0.8) return M.ROCK;
      if (h < 1.2) return M.SAND;
      if (c.veg[i] > 110) return M.FOREST;
      if (h > 620) return sl > 0.45 ? M.ROCK : M.ALPINE;
      return sl > 0.6 ? M.ROCK : M.GRASS;
    },
    // Load missing chunks nearest-first within a time budget (ms); returns true when everything is loaded.
    update(x, z, ms) {
      const t0 = performance.now();
      for (let lod = 0; lod < 2; lod++) {
        const s = LODS[lod].n * LODS[lod].cell, ccx = Math.floor(x / s), ccz = Math.floor(z / s), R = RAD[lod];
        for (let r = 0; r <= R; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
          if (Math.max(Math.abs(i), Math.abs(j)) !== r || chunks[lod].has(key(ccx + i, ccz + j))) continue;
          if (performance.now() - t0 > ms) return false;
          gen(lod, ccx + i, ccz + j);
        }
        if (chunks[lod].size > (2 * R + 5) ** 2) {
          for (const [k, c] of chunks[lod]) if (Math.abs(c.cx - ccx) > R + 2 || Math.abs(c.cz - ccz) > R + 2) chunks[lod].delete(k);
          lastK[lod] = -1;
        }
      }
      return true;
    },
    // Nearest paved road to (x, z): scans far chunks, then refines on the near grid. Returns {x, z, yaw}.
    findRoad(x, z) {
      api.update(x, z, 1e9);
      let best = null, bd = 1e18;
      for (const c of chunks[1].values()) for (let q = 0; q < c.kind.length; q++) if (c.kind[q] === 1) {
        const px = c.ox + (q % 49) * 16, pz = c.oz + Math.floor(q / 49) * 16, d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: 0 }; }
      }
      if (!best) return { x, z, yaw: 0 };
      const o = {}; bd = 1e9; const bx = best.x, bz = best.z;
      for (let j = -12; j <= 12; j++) for (let i = -12; i <= 12; i++) {
        api.ground(bx + i * 2, bz + j * 2, o);
        if (o.kind === 1 && o.rd < bd) { bd = o.rd; best.x = bx + i * 2; best.z = bz + j * 2; }
      }
      const F = (px, pz) => { terrain(px, pz); return T.L + 70 * T.N1 + TILT * px; };
      const gx = F(best.x + 4, best.z) - F(best.x - 4, best.z), gz = F(best.x, best.z + 4) - F(best.x, best.z - 4);
      best.yaw = Math.atan2(-gz, gx); // along the contour = perpendicular to the gradient of F
      return best;
    }
  };
  return api;
})();
