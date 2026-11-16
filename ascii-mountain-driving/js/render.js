'use strict';
// ASCII renderer core: glyph atlas blit, camera, voxel-space terrain ray-march (lighting, cast shadows, fog), sky.
// Every cell is one ASCII character with a foreground and background colour, written straight into ImageData.
const RD = (() => {
  const FOV = 1.25, RAMP = ' .:-=+*#%@';
  let CW = 10, CH = 19; // glyph cell in pixels, chosen on resize
  const R = {
    cols: 0, rows: 0, chr: null, fg: null, bg: null, zb: null, top: null, time: 0,
    cam: { x: 0, y: 0, z: 0, fwx: 0, fwz: 1, rtx: 1, rtz: 0, hor: 0, shear: 0, fxs: 1, fy: 1, tanH: 1 },
    lamp: { on: false, x: 0, z: 0, fx: 0, fz: 1 }, P: { x: 0, y: 0, z: 0 }
  };
  let ctx, img, px, atlas, PW, sdx = 0, sdz = 0, ssl = 1;
  const MR = new Float32Array(13), MG = new Float32Array(13), MB = new Float32Array(13);
  //           water     ice      sand    grass      forest     rock        snow     asphalt  dirt     stream  fall      alpine   snowroad
  const MCH = ['~-~=~ ', '-=_/-', '.:,.', ',.;"\',', ',;".:%', '/\\.:;\'#%', ". ':*", '=:=-=', '.:;%,', '~=s~', "|!:;|'", '.,:^;', '=-:=.'];
  const MBG = [0.6, 0.7, 0.45, 0.45, 0.45, 0.45, 0.8, 0.45, 0.45, 0.6, 0.7, 0.45, 0.7], CANOPY = '^A*%^&';
  const c8 = v => v > 255 ? 255 : v < 0 ? 0 : v | 0;
  const rgb = R.rgb = (r, g, b) => c8(r) | c8(g) << 8 | c8(b) << 16;

  R.init = canvas => { ctx = canvas.getContext('2d'); R.resize(canvas); };
  R.resize = canvas => {
    CW = clamp(Math.round(innerWidth / 140), 8, 11); CH = Math.round(CW * 1.9);
    const g = document.createElement('canvas'); g.width = CW; g.height = CH;
    const gc = g.getContext('2d', { willReadFrequently: true }), FONT = 'px "DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace';
    gc.font = 'bold 20' + FONT;
    gc.font = 'bold ' + Math.min(20 * CW / gc.measureText('M').width, CH / 1.17) + FONT; gc.fillStyle = '#fff'; // fit the font's advance to the cell
    atlas = new Uint8Array(95 * CW * CH); // per glyph pixel: coverage level 0..3
    for (let c = 0; c < 95; c++) {
      gc.clearRect(0, 0, CW, CH); gc.fillText(String.fromCharCode(c + 32), 0, CH * 0.77);
      const d = gc.getImageData(0, 0, CW, CH).data;
      for (let i = 0; i < CW * CH; i++) atlas[c * CW * CH + i] = Math.round(d[i * 4 + 3] / 85);
    }
    const cols = Math.min(150, Math.floor(innerWidth / CW)), rows = clamp(Math.round(cols * CW * innerHeight / innerWidth / CH), 24, 80), n = cols * rows;
    canvas.width = PW = cols * CW; canvas.height = rows * CH;
    img = ctx.createImageData(PW, rows * CH); px = new Uint32Array(img.data.buffer);
    R.cols = cols; R.rows = rows; R.chr = new Uint8Array(n); R.fg = new Uint32Array(n); R.bg = new Uint32Array(n); R.zb = new Float32Array(n); R.top = new Int16Array(cols);
  };
  R.blit = () => {
    const { cols, rows, chr, fg, bg } = R, lut = new Uint32Array(4), GS = CW * CH;
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
      const b = bg[i], f = fg[i], c = chr[i]; let o = y * CH * PW + x * CW;
      lut[0] = 0xff000000 | b;
      if (c <= 32 || c > 126) { for (let gy = 0; gy < CH; gy++, o += PW) px.fill(lut[0], o, o + CW); continue; }
      const br = b & 255, bg2 = b >> 8 & 255, bb = b >> 16 & 255, fr = f & 255, fg2 = f >> 8 & 255, fb = f >> 16 & 255;
      lut[1] = 0xff000000 | (br * 2 + fr) / 3 | ((bg2 * 2 + fg2) / 3 | 0) << 8 | ((bb * 2 + fb) / 3 | 0) << 16;
      lut[2] = 0xff000000 | (br + fr * 2) / 3 | ((bg2 + fg2 * 2) / 3 | 0) << 8 | ((bb + fb * 2) / 3 | 0) << 16;
      lut[3] = 0xff000000 | f;
      let a = (c - 32) * GS;
      for (let gy = 0; gy < CH; gy++, o += PW - CW) for (let gx = 0; gx < CW; gx++) px[o++] = lut[atlas[a++]];
    }
    ctx.putImageData(img, 0, 0);
  };

  // Camera: yaw rotates the view; pitch shifts the horizon; roll shears it (the classic voxel-space model).
  R.setCam = (x, y, z, yaw, pitch, roll) => {
    const c = R.cam, f = R.cols * CW / 2 / Math.tan(FOV / 2);
    c.x = x; c.y = y; c.z = z; c.fwx = Math.sin(yaw); c.fwz = Math.cos(yaw); c.rtx = Math.cos(yaw); c.rtz = -Math.sin(yaw);
    c.fxs = f / CW; c.fy = f / CH; c.tanH = Math.tan(FOV / 2);
    c.hor = R.rows / 2 + Math.tan(clamp(pitch, -1.2, 1.2)) * c.fy; c.shear = Math.tan(clamp(roll, -0.6, 0.6)) * CW / CH;
  };
  // world point -> screen cell coordinates (P.x column, P.y row, P.z depth); false when behind the camera
  R.project = (wx, wy, wz) => {
    const c = R.cam, P = R.P, dx = wx - c.x, dz = wz - c.z, zc = dx * c.fwx + dz * c.fwz;
    if (zc < 0.3) return false;
    P.x = R.cols / 2 + (dx * c.rtx + dz * c.rtz) / zc * c.fxs;
    P.y = c.hor - (P.x - R.cols / 2) * c.shear - (wy - c.y) / zc * c.fy; P.z = zc;
    return true;
  };
  // march from a surface point toward the light: 1 = lit, 0.3 = in the shadow of terrain
  const SH = [8, 20, 45, 100, 220, 480];
  R.shadow = (x, y, z) => {
    for (let k = 0; k < 6; k++) {
      const s = SH[k], qx = x + sdx * s, qz = z + sdz * s;
      let i = W.at(s < 60 ? 0 : 1, qx, qz);
      if (i < 0 && (i = W.at(1, qx, qz)) < 0) continue;
      if (W.cur.h[i] > y + 0.8 + ssl * s) return 0.3;
    }
    return 1;
  };

  function palette() { // seasonal material colours
    const E = ENV, wet = 1 - 0.25 * E.wet, set = (m, r, g, b) => { MR[m] = r; MG[m] = g; MB[m] = b; };
    set(M.WATER, 35, 85, 140); set(M.ICE, 170, 200, 222); set(M.SAND, 150, 140, 110); set(M.ROCK, 122, 116, 110);
    set(M.SNOW, 236, 240, 250); set(M.ASPHALT, 78 * wet, 78 * wet, 84 * wet); set(M.DIRT, 132 * wet, 100 * wet, 64 * wet);
    set(M.STREAM, 70, 130, 180); set(M.FALL, 220, 235, 250); set(M.SNOWROAD, 200, 205, 216);
    set(M.GRASS, E.sp([95, 70, 150, 125]), E.sp([165, 140, 135, 120]), E.sp([70, 50, 60, 95]));
    set(M.FOREST, E.sp([50, 28, 120, 45]), E.sp([125, 98, 88, 78]), E.sp([55, 44, 36, 55]));
    set(M.ALPINE, E.sp([120, 115, 135, 120]), E.sp([140, 130, 120, 118]), E.sp([90, 85, 80, 105]));
  }

  R.frame = time => {
    palette(); R.time = time;
    const { cols, rows, chr, fg, bg, zb, cam } = R, E = ENV, half = cols / 2, fy = cam.fy;
    const L = E.light, A = E.amb, ld = E.ldir, lx = ld[0], ly = ld[1], lz = ld[2], lh = Math.hypot(lx, lz) || 1;
    const doSh = L[0] + L[1] + L[2] > 0.05 && lh > 0.05;
    sdx = lx / lh; sdz = lz / lh; ssl = ly / lh;
    const invVis = 1.6 / E.vis, far = Math.min(3000, E.vis * 4), fogR = E.fogC[0], fogG = E.fogC[1], fogB = E.fogC[2];
    const snowline = E.snowline, frozen = E.frozen, lamp = R.lamp, lampK = lamp.on ? 1.1 * (1 - 0.85 * E.dayF) : 0;
    const spring = E.season === 0 && E.seasonF < 0.8, n1 = W.LODS[0].n + 1;
    const sun = E.sun, moon = E.moon, night = 1 - E.dayF, sZ = E.skyZ, sH = E.skyH, cover = E.cloud;
    const cl = [A[0] + L[0] * 0.7, A[1] + L[1] * 0.7, A[2] + L[2] * 0.7], cdark = 1 - 0.45 * cover - 0.25 * E.storm;

    for (let c = 0; c < cols; c++) {
      const u = (c + 0.5 - half) / cam.fxs, dx = cam.fwx + cam.rtx * u, dz = cam.fwz + cam.rtz * u, horc = cam.hor - (c + 0.5 - half) * cam.shear;
      let yb = rows, z = 0.7;
      // ---- terrain: march away from the camera, filling the column bottom-up ----
      while (z < far && yb > 0) {
        const x = cam.x + dx * z, zz = cam.z + dz * z;
        let near = z < 230, i = W.at(near ? 0 : 1, x, zz);
        if (i < 0 && near) { near = false; i = W.at(1, x, zz); }
        if (i >= 0) {
          const chk = W.cur; let h = chk.h[i], canopy = false, rd = chk.rd[i];
          if (near && z < 90) {
            const a = W.fx, b = W.fz; h = lerp(lerp(h, chk.h[i + 1], a), lerp(chk.h[i + n1], chk.h[i + n1 + 1], a), b);
            rd = lerp(lerp(rd, chk.rd[i + 1], a), lerp(chk.rd[i + n1], chk.rd[i + n1 + 1], a), b);
          }
          const veg = chk.veg[i];
          if (h < 0) h = 0; else if (z > 170 && veg > 110) { h += 9 * sat((z - 170) / 60) * veg / 255; canopy = true; }
          const y = Math.floor(horc - (h - cam.y) / z * fy + 0.5);
          if (y < yb) {
            const mat = W.material(chk, i, snowline, frozen), flat = mat <= M.ICE;
            const gx = flat ? 0 : chk.gx[i], gz = flat ? 0 : chk.gz[i];
            let ndl = (ly - gx * lx - gz * lz) / Math.sqrt(gx * gx + 1 + gz * gz);
            if (ndl < 0) ndl = 0; else if (doSh) ndl *= R.shadow(x, h, zz);
            let lr = A[0] + L[0] * ndl, lg = A[1] + L[1] * ndl, lb = A[2] + L[2] * ndl;
            if (lampK > 0) { // headlight cone
              const ex = x - lamp.x, ez = zz - lamp.z, al = ex * lamp.fx + ez * lamp.fz;
              if (al > 0.5 && al < 75) {
                const w = al * 0.42 + 1.2, lat = Math.abs(ex * lamp.fz - ez * lamp.fx);
                if (lat < w) { const k = (1 - al / 75) * (1 - al / 75) * (1 - lat / w) * lampK; lr += k; lg += k * 0.95; lb += k * 0.8; }
              }
            }
            let r = MR[mat] * lr, g = MG[mat] * lg, b = MB[mat] * lb;
            const gs = z < 20 ? 2 : z < 50 ? 1 : z < 120 ? 0.5 : z < 300 ? 0.25 : 0.0625; // texture grid anchored to the world
            let hs = W.hashi(Math.floor(x * gs), Math.floor(zz * gs), 7), set = MCH[mat], ch;
            if (mat === M.WATER) {
              hs = W.hashi(Math.floor(x * gs + time * 0.8), Math.floor(zz * gs), 7);
              r = lerp(r, sH[0] * 0.9, 0.45); g = lerp(g, sH[1] * 0.9, 0.45); b = lerp(b, sH[2] * 0.9, 0.45);
            } else if (mat === M.FALL) hs = W.hashi(Math.floor(x * gs), Math.floor(zz * gs), 7 + Math.floor(time * 9));
            else if (canopy) set = CANOPY;
            ch = set.charCodeAt(hs % set.length);
            if (near) {
              if (mat === M.ASPHALT && rd > -0.7 && rd < 0.7 && z < 90 && (Math.floor((x + zz) * 0.12) & 1)) { ch = 124; r = 235 * lr; g = 205 * lg; b = 90 * lb; } // centre line
              else if (mat === M.DIRT && z < 90 && Math.abs(Math.abs(rd) - 3.6) < 1.2) { r *= 0.72; g *= 0.72; b *= 0.72; ch = 58; }                               // wheel ruts
              else if (mat === M.GRASS && spring && z < 140 && hs % 19 === 0) { ch = 42; r = 240 * lr; g = (hs & 64 ? 220 : 150) * lg; b = (hs & 128 ? 90 : 190) * lb; } // flowers
            }
            const fo = 1 - Math.exp(-z * invVis);
            r += (fogR - r) * fo; g += (fogG - g) * fo; b += (fogB - b) * fo;
            const f = rgb(r, g, b), k = MBG[mat], bc = rgb(r * k, g * k, b * k), y0 = y < 0 ? 0 : y;
            for (let q = y0 * cols + c, rw = y0; rw < yb; rw++, q += cols) { chr[q] = ch; fg[q] = f; bg[q] = bc; zb[q] = z; }
            yb = y0;
          }
        }
        z += z < 6 ? 0.2 : z * 0.034;
      }
      R.top[c] = yb;
      // ---- sky: gradient, sun, moon, stars, drifting clouds ----
      const dl2 = dx * dx + dz * dz;
      for (let rw = 0, q = c; rw < yb; rw++, q += cols) {
        const t = (horc - rw - 0.5) / fy, inv = 1 / Math.sqrt(dl2 + t * t), ex = dx * inv, ey = t * inv, ez = dz * inv;
        const k = sat(ey * 1.6); let r = lerp(sH[0], sZ[0], k), g = lerp(sH[1], sZ[1], k), b = lerp(sH[2], sZ[2], k), ch = 32, fr = 255, fgc = 255, fb = 255;
        const sd = ex * sun[0] + ey * sun[1] + ez * sun[2], md = ex * moon[0] + ey * moon[1] + ez * moon[2];
        if (sd > 0.93 && sun[1] > -0.1) { const gl = (sd - 0.93) * 9 * (1 - cover * 0.6); r += 255 * gl; g += 190 * gl; b += 90 * gl; }
        if (sd > 0.9993) { ch = 64; fr = 255; fgc = 250; fb = 215; r = 255; g = 235; b = 160; }
        else if (md > 0.9995 && night > 0.3) { ch = 79; fr = 235; fgc = 238; fb = 225; r += 60; g += 62; b += 60; }
        else if (night > 0.3 && ey > 0) {
          const st = W.hashi(Math.floor(Math.atan2(ex, ez) * 140), Math.floor(ey * 140), 9);
          if ((st & 255) < 3) { ch = st & 256 ? 46 : st & 512 ? 43 : 42; const tw = night * (0.55 + 0.45 * Math.sin(time * 3 + (st >> 10))); fr = fgc = 255 * tw; fb = 235 * tw; }
        }
        if (ey > 0.015) {
          const s = 1400 / ey, n = W.fbm((cam.x + ex * s + E.cloudX) / 2600, (cam.z + ez * s + E.cloudZ) / 2600, 3, 500);
          const d = sat((n + cover * 1.25 - 0.55) * 2.5) * sat(ey * 8);
          if (d > 0.05) {
            const v = 235 * (cdark + 0.25 * (1 - d)), cr = v * cl[0], cg = v * cl[1], cb = v * cl[2];
            r = lerp(r, cr, d * 0.9); g = lerp(g, cg, d * 0.9); b = lerp(b, cb, d * 0.9);
            if (ch !== 64) { ch = RAMP.charCodeAt(Math.min(9, d * 10 | 0)); fr = cr * 1.25 + 12; fgc = cg * 1.25 + 12; fb = cb * 1.25 + 12; }
          }
        }
        chr[q] = ch; fg[q] = rgb(fr, fgc, fb); bg[q] = rgb(r, g, b); zb[q] = 1e9;
      }
    }
  };
  return R;
})();
