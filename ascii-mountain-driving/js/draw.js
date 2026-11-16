'use strict';
// Scene objects and overlays drawn over the terrain: tree/rock sprites, the 3D car model, particles,
// precipitation, lightning, HUD, minimap and menu. Everything is z-tested against the terrain depth buffer.
(() => {
  const R = RD, rgb = R.rgb, P = R.P;
  const put = (q, ch, f, b) => { R.chr[q] = ch; R.fg[q] = f; R.bg[q] = b; };
  const fogK = z => 1 - Math.exp(-z * 1.6 / ENV.vis);
  // lit + fogged colour, k = extra brightness factor
  const shade = (r, g, b, lr, lg, lb, fo, k) => { const F = ENV.fogC; return rgb((r * lr + (F[0] - r * lr) * fo) * k, (g * lg + (F[1] - g * lg) * fo) * k, (b * lb + (F[2] - b * lb) * fo) * k); };

  // ---------- trees, snags, boulders, bushes: procedural ASCII sprites scaled by distance ----------
  const ASP = [0.42, 0.62, 0.25, 1.5, 1.3], FARCH = [94, 42, 124, 111, 44];
  R.sprites = () => {
    const { cols, rows, cam, zb, time } = R, E = ENV, half = cols / 2, A = E.amb, L = E.light, lit = L[0] + L[1] + L[2] > 0.05;
    const ccx = Math.floor(cam.x / 96), ccz = Math.floor(cam.z / 96), side = Math.sign(E.ldir[0] * cam.rtx + E.ldir[2] * cam.rtz);
    const bare = E.season === 3 || (E.season === 2 && E.seasonF > 0.85);
    const BR = E.sp([100, 45, 205, 110]), BG = E.sp([160, 112, 120, 100]), BB = E.sp([75, 52, 40, 90]);
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      const ck = W.chunk(0, ccx + i, ccz + j); if (!ck) continue;
      for (const o of ck.objs) {
        const ox = o.x - cam.x, oz = o.z - cam.z, zc = ox * cam.fwx + oz * cam.fwz;
        if (zc < 0.7 || zc > 260) continue;
        const xc = ox * cam.rtx + oz * cam.rtz; if (Math.abs(xc) > zc * cam.tanH * 1.05 + o.s) continue;
        const sx = half + xc / zc * cam.fxs, by = cam.hor - (sx - half) * cam.shear - (o.y - cam.y) / zc * cam.fy, H = o.s / zc * cam.fy;
        if (by - H >= rows || by < 0) continue;
        const sh = lit ? R.shadow(o.x, o.y + o.s * 0.6, o.z) : 1, lr = A[0] + L[0] * 0.8 * sh, lg = A[1] + L[1] * 0.8 * sh, lb = A[2] + L[2] * 0.8 * sh;
        const fo = fogK(zc), t = o.t, snowy = o.y > E.snowline - 30, seed = o.q * 1e6 | 0;
        let cr, cg, cb;
        if (t === 0) { cr = 26; cg = 88 + o.q * 25; cb = 50; }
        else if (t === 1 || t === 4) { cr = BR; cg = BG * (0.7 + 0.6 * o.q); cb = BB; if (t === 1 && bare) { cr = 112; cg = 96; cb = 82; } }
        else if (t === 2) { cr = 120; cg = 105; cb = 90; } else { cr = 128; cg = 122; cb = 116; }
        if (H < 1.3) { // far away: a single character
          const c = Math.floor(sx), rw = Math.floor(by - 0.6); if (c < 0 || c >= cols || rw < 0 || rw >= rows) continue;
          const q = rw * cols + c; if (zc >= zb[q]) continue;
          zb[q] = zc; put(q, FARCH[t], shade(cr, cg, cb, lr, lg, lb, fo, 1), shade(cr, cg, cb, lr, lg, lb, fo, 0.4)); continue;
        }
        const h = Math.ceil(H), top = Math.floor(by) - h, wH = o.s * ASP[t] / zc * cam.fxs / 2;
        const sway = t < 2 ? Math.sin(time * 1.7 + o.q * 40) * E.wind * 0.012 * wH : 0;
        for (let r = 0; r < h; r++) {
          const rw = top + r; if (rw < 0 || rw >= rows) continue;
          const tt = (r + 0.5) / h; let hw, trunk = false;
          if (t === 0) { if (tt < 0.86) { const a = tt / 0.86; hw = wH * (0.12 + 0.88 * a) * (0.55 + 0.45 * (a * 4 % 1)); } else { trunk = true; hw = Math.max(0.5, wH * 0.09); } }
          else if (t === 1) { if (tt < 0.72) { const e = tt / 0.72 * 2 - 1; hw = wH * Math.sqrt(1 - e * e * 0.92); } else { trunk = true; hw = Math.max(0.5, wH * 0.1); } }
          else if (t === 2) hw = 0.5 + (tt < 0.7 && W.hashi(r, seed, 3) % 4 === 0 ? 1 : 0);
          else if (t === 3) hw = wH * Math.sqrt(1 - (1 - tt) * (1 - tt));
          else { const e = tt * 2 - 1; hw = wH * Math.sqrt(1 - e * e * 0.8); }
          const cxs = sx + (trunk ? 0 : sway * (1 - tt)), c0 = Math.max(0, Math.round(cxs - hw)), c1 = Math.min(cols - 1, Math.round(cxs + hw) - 1);
          for (let c = c0; c <= c1; c++) {
            const q = rw * cols + c; if (zc >= zb[q]) continue;
            const e = (c + 0.5 - cxs) / (hw + 0.01), hs = W.hashi(c - Math.round(sx), r, seed);
            let ch, r2 = cr, g2 = cg, b2 = cb;
            if (trunk) { ch = t === 2 && Math.abs(e) > 0.4 ? (e < 0 ? 92 : 47) : 124; if (t < 2) { r2 = 98; g2 = 74; b2 = 54; } }
            else if (t === 0) { ch = r === 0 || c0 === c1 ? 94 : c === c0 ? 47 : c === c1 ? 92 : hs % 5 === 0 ? 94 : e < 0 ? 47 : 92; if (snowy && hs % 3 === 0) r2 = g2 = b2 = 235; }
            else if (t === 1) {
              if (bare) { if (hs % 3) continue; ch = '\\/|Y-'.charCodeAt(hs % 5); }
              else ch = c0 < c1 && c === c0 ? 40 : c0 < c1 && c === c1 ? 41 : '@%&#*o'.charCodeAt(hs % 6);
            }
            else if (t === 3) { ch = r === 0 ? 95 : c === c0 ? 47 : c === c1 ? 92 : '#%&:'.charCodeAt(hs % 4); if (snowy && tt < 0.35) r2 = g2 = b2 = 235; }
            else ch = '%&*"'.charCodeAt(hs % 4);
            const k = 1 + 0.22 * side * e;
            zb[q] = zc; put(q, ch, shade(r2, g2, b2, lr, lg, lb, fo, k), shade(r2, g2, b2, lr, lg, lb, fo, k * 0.38));
          }
        }
      }
    }
  };

  // ---------- tiny rasteriser for the car: z-tested triangles and ASCII edge lines ----------
  function tri(x0, y0, z0, x1, y1, z1, x2, y2, z2, ch, f, b) { // ch 0 = darken what is there (ground shadow)
    const { cols, rows, zb } = R, A = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(A) < 1e-4) return;
    const xa = Math.max(0, Math.floor(Math.min(x0, x1, x2))), xb = Math.min(cols - 1, Math.ceil(Math.max(x0, x1, x2)));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1, y2))), yb = Math.min(rows - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / A, w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / A, w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * z0 + w1 * z1 + w2 * z2, q = y * cols + x;
      if (ch === 0) { if (z - 1 < zb[q]) { R.fg[q] = R.fg[q] >> 1 & 0x7f7f7f; R.bg[q] = R.bg[q] >> 1 & 0x7f7f7f; } }
      else if (z < zb[q]) { zb[q] = z; put(q, ch, f, b); }
    }
  }
  function line(x0, y0, z0, x1, y1, z1, f) {
    const { cols, rows, zb } = R, dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
    if (n > 500) return;
    const ch = Math.abs(dx) > Math.abs(dy) * 2.2 ? 45 : Math.abs(dy) > Math.abs(dx) * 2.2 ? 124 : dx * dy > 0 ? 92 : 47;
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0, x = Math.floor(x0 + dx * t), y = Math.floor(y0 + dy * t);
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const q = y * cols + x, z = z0 + (z1 - z0) * t - 0.08;
      if (z <= zb[q]) { zb[q] = z; R.chr[q] = ch; R.fg[q] = f; }
    }
  }
  // Box in car body coordinates. Vertex bits: 1 = +x, 2 = top, 4 = front. Faces: left, right, bottom, top, rear, front.
  const FACES = [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]], V = new Float32Array(24), S = new Float32Array(24);
  function box(cx, cy, cz, hx, hy, hz, tx, tzr, tzf, ang, cols6, chs, em) {
    const M9 = Car.R, p = Car.p, ca = Math.cos(ang), sa = Math.sin(ang), E = ENV, A = E.amb, L = E.light, ld = E.ldir, cam = R.cam;
    let mx = 0, my = 0, mz = 0;
    for (let i = 0; i < 8; i++) {
      const top = i & 2, x = (i & 1 ? 1 : -1) * (hx - (top ? tx : 0)), z = i & 4 ? hz - (top ? tzf : 0) : -hz + (top ? tzr : 0), y = cy + (top ? hy : -hy);
      const bx = cx + x * ca + z * sa, bz = cz - x * sa + z * ca;
      const wx = p[0] + M9[0] * bx + M9[3] * y + M9[6] * bz, wy = p[1] + M9[1] * bx + M9[4] * y + M9[7] * bz, wz = p[2] + M9[2] * bx + M9[5] * y + M9[8] * bz;
      if (!R.project(wx, wy, wz)) return;
      V[i * 3] = wx; V[i * 3 + 1] = wy; V[i * 3 + 2] = wz; S[i * 3] = P.x; S[i * 3 + 1] = P.y; S[i * 3 + 2] = P.z;
      mx += wx / 8; my += wy / 8; mz += wz / 8;
    }
    for (let f = 0; f < 6; f++) {
      const ch = chs.charCodeAt(f); if (ch === 32) continue;
      const a = FACES[f][0] * 3, b = FACES[f][1] * 3, c = FACES[f][2] * 3, d = FACES[f][3] * 3;
      const e1x = V[b] - V[a], e1y = V[b + 1] - V[a + 1], e1z = V[b + 2] - V[a + 2], e2x = V[d] - V[a], e2y = V[d + 1] - V[a + 1], e2z = V[d + 2] - V[a + 2];
      let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
      const fx = (V[a] + V[c]) / 2, fy = (V[a + 1] + V[c + 1]) / 2, fz = (V[a + 2] + V[c + 2]) / 2;
      if (nx * (fx - mx) + ny * (fy - my) + nz * (fz - mz) < 0) { nx = -nx; ny = -ny; nz = -nz; }
      if (nx * (fx - cam.x) + ny * (fy - cam.y) + nz * (fz - cam.z) >= 0) continue; // back face
      const ndl = Math.max(0, (nx * ld[0] + ny * ld[1] + nz * ld[2]) / (Math.hypot(nx, ny, nz) || 1));
      const lr = em ? 1 : A[0] + L[0] * ndl, lg = em ? 1 : A[1] + L[1] * ndl, lb = em ? 1 : A[2] + L[2] * ndl, col = cols6[f], fo = em ? 0 : fogK(S[a + 2]);
      const fc = shade(col[0], col[1], col[2], lr, lg, lb, fo, 1), bc = shade(col[0], col[1], col[2], lr, lg, lb, fo, 0.6);
      tri(S[a], S[a + 1], S[a + 2], S[b], S[b + 1], S[b + 2], S[c], S[c + 1], S[c + 2], ch, fc, bc);
      tri(S[a], S[a + 1], S[a + 2], S[c], S[c + 1], S[c + 2], S[d], S[d + 1], S[d + 2], ch, fc, bc);
      if (em) continue;
      const ec = shade(col[0], col[1], col[2], lr, lg, lb, fo, 0.3), q = FACES[f];
      for (let k = 0; k < 4; k++) { const u = q[k] * 3, v = q[(k + 1) & 3] * 3; line(S[u], S[u + 1], S[u + 2], S[v], S[v + 1], S[v + 2], ec); }
    }
  }
  R.car = () => {
    const d = Car.def, pc = PAINT[Car.cfg.paint], paint = [pc[1], pc[2], pc[3]], dark = [40, 40, 44], glass = [70, 105, 130], g = Car.g;
    const yb = d.clear - d.cg, yt = d.hgt - d.cg, hx = d.wid / 2, hz = d.len / 2, bh = (yt - yb) * 0.52, M9 = Car.R, p = Car.p, s = [];
    for (let i = 0; i < 4; i++) { // soft shadow quad on the ground under the car
      const bx = (i & 1 ? 1 : -1) * hx * 1.05, bz = (i & 2 ? 1 : -1) * hz * 1.05, wx = p[0] + M9[0] * bx + M9[6] * bz, wz = p[2] + M9[2] * bx + M9[8] * bz;
      if (!R.project(wx, Math.max(0, W.ground(wx, wz, g).h) + 0.05, wz)) return;
      s.push(P.x, P.y, P.z);
    }
    tri(s[0], s[1], s[2], s[3], s[4], s[5], s[9], s[10], s[11], 0); tri(s[0], s[1], s[2], s[9], s[10], s[11], s[6], s[7], s[8], 0);
    const P6 = [paint, paint, paint, paint, paint, paint], D6 = [dark, dark, dark, dark, dark, dark];
    for (let i = 0; i < 4; i++) {
      const w = Car.wheels[i], side = Math.floor(w.ang * 1.5) & 1 ? 'O' : '@';
      box(Math.sign(w.x) * (hx - 0.1), w.y, w.z, 0.13, d.wr, d.wr, 0, 0.08, 0.08, i < 2 ? Car.steerA : 0, D6, side + side + ' ===');
    }
    box(0, yb + bh / 2, 0, hx, bh / 2, hz, 0.04, 0.04, 0.1, 0, P6, '## =%%');
    const z0 = d.cab[0] * d.len, z1 = d.cab[1] * d.len, ch = (yt - yb - bh) / 2;
    box(0, yb + bh + ch, (z0 + z1) / 2, hx - 0.03, ch, (z1 - z0) / 2, 0.14, 0.18, 0.45, 0, [glass, glass, paint, paint, glass, glass], ':: =::');
    const head = Car.lights ? [255, 250, 205] : [185, 185, 175], tail = Car.brk > 0.1 ? [255, 70, 55] : Car.lights ? [200, 40, 32] : [130, 30, 26];
    for (const sx of [-1, 1]) {
      box(sx * hx * 0.62, yb + bh * 0.62, hz - 0.08, 0.2, 0.09, 0.03, 0, 0, 0, 0, [head, head, head, head, head, head], '     o', true);
      box(sx * hx * 0.66, yb + bh * 0.7, -hz + 0.02, 0.2, 0.08, 0.03, 0, 0, 0, 0, [tail, tail, tail, tail, tail, tail], '    * ', true);
    }
  };
  R.hood = () => { // first-person view: a strip of bonnet at the bottom of the screen
    const { cols, rows } = R, pc = PAINT[Car.cfg.paint], l = 0.25 + 0.75 * ENV.dayF;
    for (let r = 0; r < 4; r++) for (let c = Math.floor(cols * 0.18) - r * 3; c < cols * 0.82 + r * 3; c++) {
      const q = (rows - 4 + r) * cols + c; put(q, r === 0 ? 95 : 61, rgb(pc[1] * l, pc[2] * l, pc[3] * l), rgb(pc[1] * l * 0.55, pc[2] * l * 0.55, pc[3] * l * 0.55)); R.zb[q] = 0;
    }
  };

  // ---------- particles (dust, snow spray, splash, smoke) ----------
  const parts = [];
  R.spawn = (x, y, z, vx, vy, vz, life, ch, r, g, b) => { if (parts.length < 400) parts.push({ x, y, z, vx, vy, vz, life, ch, r, g, b }); };
  R.particles = dt => {
    const { cols, rows, zb } = R, A = ENV.amb, L = ENV.light, lr = A[0] + L[0] * 0.7, lg = A[1] + L[1] * 0.7, lb = A[2] + L[2] * 0.7;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if ((p.life -= dt) <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vy -= 3 * dt; p.x += (p.vx + ENV.wx * 0.3) * dt; p.y += p.vy * dt; p.z += (p.vz + ENV.wz * 0.3) * dt;
      if (!R.project(p.x, p.y, p.z)) continue;
      const c = Math.floor(P.x), rw = Math.floor(P.y); if (c < 0 || rw < 0 || c >= cols || rw >= rows) continue;
      const q = rw * cols + c; if (P.z < zb[q]) { R.chr[q] = p.ch; R.fg[q] = rgb(p.r * lr, p.g * lg, p.b * lb); }
    }
  };

  // ---------- rain / snow streaks in screen space, lightning bolt ----------
  const drops = Array.from({ length: 340 }, () => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8 }));
  R.precip = (dt, amount, snow, lateral) => {
    const { cols, rows } = R, n = Math.min(340, amount * 340 | 0), l = 0.35 + 0.65 * ENV.dayF + ENV.flash;
    const f = snow ? rgb(240 * l, 242 * l, 250 * l) : rgb(150 * l, 175 * l, 215 * l);
    for (let i = 0; i < n; i++) {
      const d = drops[i];
      d.y += d.s * dt * (snow ? 0.3 : 1.9); d.x += (lateral + (snow ? Math.sin(R.time * 2 + i) * 0.04 : 0)) * d.s * dt;
      if (d.y > 1) { d.y -= 1; d.x = Math.random(); } d.x -= Math.floor(d.x);
      const q = Math.floor(d.y * rows) * cols + Math.floor(d.x * cols);
      R.chr[q] = snow ? (i & 1 ? 42 : 46) : lateral > 0.12 ? 92 : lateral < -0.12 ? 47 : 124; R.fg[q] = f;
    }
  };
  R.bolt = () => {
    const E = ENV, cam = R.cam, dx = Math.sin(E.boltAz), dz = Math.cos(E.boltAz), zc = dx * cam.fwx + dz * cam.fwz;
    if (E.flash < 0.25 || zc < 0.2) return;
    let c = Math.round(R.cols / 2 + (dx * cam.rtx + dz * cam.rtz) / zc * cam.fxs);
    for (let r = 0; c >= 0 && c < R.cols && r < R.top[c]; r++) {
      const s = W.hashi(r, E.boltSeed, 5) % 3 - 1;
      put(r * R.cols + c, s < 0 ? 47 : s > 0 ? 92 : 124, 0xffffff, rgb(200, 205, 255)); c += s;
    }
  };

  // ---------- HUD ----------
  R.text = (x, y, s, f, b) => {
    if (y < 0 || y >= R.rows) return;
    for (let i = 0; i < s.length; i++) {
      const c = x + i; if (c < 0 || c >= R.cols) continue;
      const q = y * R.cols + c; R.chr[q] = s.charCodeAt(i); R.fg[q] = f; R.bg[q] = b === undefined ? R.bg[q] >> 2 & 0x3f3f3f : b;
    }
  };
  const bar = (v, n) => '#'.repeat(Math.round(sat(v) * n)).padEnd(n, '-'), p2 = n => String(n).padStart(2, '0');
  const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'], dir8 = a => DIRS[(Math.round(a / (Math.PI / 4)) % 8 + 8) % 8];
  const MAPCH = '~=..^%*#:~~,=', MAPC = [[60, 120, 200], [170, 200, 220], [170, 160, 120], [90, 160, 70], [40, 120, 55], [130, 125, 120], [240, 240, 250], [255, 255, 255], [190, 140, 80], [90, 170, 220], [200, 230, 250], [140, 150, 100], [215, 220, 230]];
  R.hud = (msg, camYaw) => {
    const { cols, rows } = R, E = ENV, d = Car.def, white = rgb(235, 235, 235), dim = rgb(150, 160, 172), bad = rgb(255, 95, 70), amber = rgb(250, 190, 70);
    const hh = Math.floor(E.time), kmh = Car.speed * 3.6, T = R.text;
    T(1, 0, `${SEASONS[E.season]}  ${p2(hh)}:${p2(Math.floor((E.time - hh) * 60))}  ${WEATHER[E.weather]}  ${E.temp(Car.p[1]).toFixed(0)}C  WIND ${E.wind.toFixed(0)}m/s ${dir8(E.windDir)}`, white);
    let cs = ''; const yd = camYaw * 180 / Math.PI; // compass strip, 3 degrees per cell
    for (let i = -16; i <= 16; i++) { const b = ((Math.round(yd / 3) + i) * 3 % 360 + 360) % 360; cs += b % 90 === 0 ? 'NESW'[b / 90] : b % 45 === 0 ? '+' : b % 15 === 0 ? '.' : '-'; }
    T((cols >> 1) - 16, 0, cs, white); T(cols >> 1, 1, '^', amber);
    const y = rows - 4, gear = Car.gear < 0 ? 'R' : Car.gear === 0 ? 'N' : Car.gear;
    T(1, y, `${kmh.toFixed(0).padStart(3)} km/h   GEAR ${gear} ${Car.auto ? 'AUTO' : 'MANUAL'}${Car.hand ? '  [HANDBRAKE]' : ''}${Car.lights ? '  [LIGHTS]' : ''}`, white);
    T(1, y + 1, `RPM  [${bar(Car.rpm / d.red, 24)}] ${(Car.rpm / 10 | 0) * 10}`, Car.rpm > d.red * 0.9 ? bad : amber);
    T(1, y + 2, `FUEL [${bar(Car.fuel / d.tank, 24)}] ${Car.fuel.toFixed(1)}L`, Car.fuel < d.tank * 0.12 ? bad : white);
    const pc = v => ((1 - v) * 100).toFixed(0), D = Car.dmg;
    T(1, y + 3, `BODY ${pc(D.body)}  ENG ${pc(D.engine)}  SUSP ${pc(D.susp)}  TYRE ${pc(D.tire)}   ${d.name} / ${TIRES[Car.cfg.tire].name}`, D.engine > 0.5 || D.body > 0.6 ? bad : dim);
    const pos = `ALT ${Car.p[1].toFixed(0)}m  X ${Car.p[0].toFixed(0)} Z ${Car.p[2].toFixed(0)}  ODO ${(Car.odo / 1000).toFixed(1)}km`;
    T(cols - pos.length - 1, 0, pos, white);
    // minimap, north up, 20 m per column
    const mx = cols - 24, yaw = Car.yaw;
    T(mx - 1, 1, '+' + '-'.repeat(23) + '+', dim, 0); T(mx - 1, 13, '+' + '-'.repeat(23) + '+', dim, 0);
    for (let j = 2; j < 13; j++) { T(mx - 1, j, '|', dim, 0); T(mx + 23, j, '|', dim, 0); }
    for (let j = 0; j < 11; j++) for (let i = 0; i < 23; i++) {
      const k = W.at(1, Car.p[0] + (i - 11) * 20, Car.p[2] - (j - 5) * 37.5), q = (j + 2) * cols + mx + i;
      if (k < 0) { put(q, 32, 0, 0x101010); continue; }
      const m = W.material(W.cur, k, E.snowline, E.frozen), c = MAPC[m];
      put(q, MAPCH.charCodeAt(m), rgb(c[0], c[1], c[2]), rgb(c[0] * 0.22, c[1] * 0.22, c[2] * 0.22));
    }
    put(7 * cols + mx + 11, '^>v<'.charCodeAt((Math.round(yaw / (Math.PI / 2)) % 4 + 4) % 4), rgb(255, 60, 50), 0);
    const warn = [];
    if (Car.R[4] < 0.3) warn.push('ROLLED OVER - PRESS R TO RECOVER');
    if (Car.fuel <= 0) warn.push('OUT OF FUEL - OPEN GARAGE (G) TO REFUEL'); else if (Car.fuel < d.tank * 0.12) warn.push('LOW FUEL');
    if (D.engine >= 1) warn.push('ENGINE DEAD - OPEN GARAGE (G) TO REPAIR'); else if (D.engine > 0.5) warn.push('ENGINE DAMAGED');
    if (Car.sub > 0.5) warn.push('WATER! ENGINE FLOODING');
    warn.forEach((w, i) => T((cols - w.length) >> 1, 3 + i, w, bad));
    if (msg) T((cols - msg.length) >> 1, rows / 3 | 0, msg, white);
  };
  R.menu = (title, items, sel, hint) => {
    const { cols, rows } = R, w = 52, x = (cols - w) >> 1, y = (rows - items.length - 6) >> 1, bgc = rgb(12, 16, 22), hi = rgb(250, 200, 80), fgc = rgb(215, 220, 228);
    for (let r = 0; r < items.length + 6; r++) R.text(x, y + r, ' '.repeat(w), fgc, bgc);
    R.text(x, y, '+' + '-'.repeat(w - 2) + '+', hi, bgc); R.text(x, y + items.length + 5, '+' + '-'.repeat(w - 2) + '+', hi, bgc);
    R.text(x + ((w - title.length) >> 1), y + 1, title, hi, bgc);
    items.forEach((it, i) => {
      const v = it.value === undefined ? '' : `< ${it.value} >`;
      R.text(x + 2, y + 3 + i, ((i === sel ? '> ' : '  ') + it.label).padEnd(w - 4 - v.length) + v, i === sel ? hi : fgc, i === sel ? rgb(40, 46, 58) : bgc);
    });
    R.text(x + ((w - hint.length) >> 1), y + items.length + 4, hint, rgb(140, 150, 165), bgc);
  };
})();
