/*
 * 삼천의 운명 — 고해상도 도트 캐릭터 렌더러
 *
 * 캐릭터를 도형(구·원기둥·다각형)으로 조립하고, 왼쪽 위에서 오는 빛으로 픽셀마다 명암을 계산해
 * 색마다 4단계(밝음·기본·중간·어둠)로 끊는다. 겹치는 부위 경계에는 안쪽 선을, 바깥에는
 * 색을 따라가는 외곽선을 자동으로 넣는다. 팔다리와 무기가 좌표로 움직이므로 4방향, 걷기, 점프,
 * 공격, 시전 프레임을 같은 규칙으로 만들 수 있다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const S = F.sprites;
  const C = S.C;
  const FW = 56;
  const FH = 64;
  const OX = 4;
  const OY = 4;
  const L = (() => { const l = Math.hypot(-0.55, -0.62, 0.56); return [-0.55 / l, -0.62 / l, 0.56 / l]; })();

  /* ── 색 ── */
  function toRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }
  function mix(a, b, t) {
    const x = toRgb(a);
    const y = toRgb(b);
    return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }
  function mul(a, k) {
    const x = toRgb(a);
    return toHex(x[0] * k, x[1] * k, x[2] * k);
  }
  const rampCache = new Map();
  function ramp(base) {
    let r = rampCache.get(base);
    if (!r) {
      r = [mix(base, "#fff6dc", 0.34), base, mix(mul(base, 0.8), "#3b2a70", 0.14), mix(mul(base, 0.58), "#221848", 0.3)];
      rampCache.set(base, r);
    }
    return r;
  }
  function edgeColor(base) {
    return mix(mul(base, 0.36), "#120c20", 0.55);
  }

  /* ── 픽셀 버퍼와 붓 ── */
  function Painter(w, h, k) {
    this.k = k || 1;
    this.w = Math.round(w * this.k);
    this.h = Math.round(h * this.k);
    w = this.w;
    h = this.h;
    this.mat = new Array(w * h).fill(null);
    this.tone = new Int8Array(w * h);
    this.part = new Int16Array(w * h).fill(-1);
    this.edge = new Uint8Array(w * h);
    this.col = new Array(w * h).fill(null);
    this.pid = 0;
    this.cur = null;
    this.curEdge = 1;
    this.flat = false;
    this.glow = [];
  }
  const P = Painter.prototype;
  P.use = function (color, opts) {
    this.pid++;
    this.cur = color;
    this.curEdge = opts && opts.edge === 0 ? 0 : 1;
    this.flat = !!(opts && opts.flat);
    return this;
  };
  P.put = function (x, y, tone) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.mat[i] = this.cur;
    this.tone[i] = tone;
    this.part[i] = this.pid;
    this.edge[i] = this.curEdge;
    this.col[i] = null;
  };
  P.shadeTone = function (nx, ny, nz) {
    if (this.flat) return ny < -0.4 ? 0 : 1;
    const v = nx * L[0] + ny * L[1] + nz * L[2];
    return v > 0.72 ? 0 : v > 0.34 ? 1 : v > 0.02 ? 2 : 3;
  };
  P.ellipse = function (cx, cy, rx, ry, clip) {
    if (rx <= 0 || ry <= 0) return this;
    const k = this.k;
    cx *= k; cy *= k; rx *= k; ry *= k;
    const clip0 = clip;
    clip = clip0 ? (x, y) => clip0((x + 0.5) / k - 0.5, (y + 0.5) / k - 0.5) : null;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        if (clip && !clip(x, y)) continue;
        this.put(x, y, this.shadeTone(dx, dy, Math.sqrt(1 - d)));
      }
    }
    return this;
  };
  P.ring = function (cx, cy, rx, ry, inner) {
    const k = this.k;
    cx *= k; cy *= k; rx *= k; ry *= k;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1 || d < inner) continue;
        this.put(x, y, dy < 0 ? 0 : 1);
      }
    }
    return this;
  };
  P.capsule = function (x1, y1, x2, y2, r, r2) {
    const k = this.k;
    x1 *= k; y1 *= k; x2 *= k; y2 *= k; r *= k;
    const rb = r2 === undefined ? r : r2 * k;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-6;
    const R = Math.max(r, rb);
    for (let y = Math.floor(Math.min(y1, y2) - R - 1); y <= Math.ceil(Math.max(y1, y2) + R + 1); y++) {
      for (let x = Math.floor(Math.min(x1, x2) - R - 1); x <= Math.ceil(Math.max(x1, x2) + R + 1); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        let t = ((px - x1) * dx + (py - y1) * dy) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x1 + dx * t;
        const qy = y1 + dy * t;
        const rr = r + (rb - r) * t;
        const ox = (px - qx) / rr;
        const oy = (py - qy) / rr;
        const d = ox * ox + oy * oy;
        if (d > 1) continue;
        this.put(x, y, this.shadeTone(ox, oy, Math.sqrt(1 - d)));
      }
    }
    return this;
  };
  /* 다각형: 가로 방향으로는 원기둥처럼, 세로로는 위가 밝게 */
  P.poly = function (pts, clip) {
    const k = this.k;
    pts = pts.map((p) => [p[0] * k, p[1] * k]);
    if (clip) { const c0 = clip; clip = (x, y) => c0((x + 0.5) / k - 0.5, (y + 0.5) / k - 0.5); }
    let top = Infinity;
    let bot = -Infinity;
    pts.forEach((p) => { top = Math.min(top, p[1]); bot = Math.max(bot, p[1]); });
    for (let y = Math.floor(top); y <= Math.ceil(bot); y++) {
      const sy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        if ((a[1] <= sy && b[1] > sy) || (b[1] <= sy && a[1] > sy)) {
          xs.push(a[0] + ((sy - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
        }
      }
      xs.sort((m, n) => m - n);
      if (xs.length < 2) continue;
      const left = xs[0];
      const right = xs[xs.length - 1];
      const mid = (left + right) / 2;
      const half = Math.max(1, (right - left) / 2);
      const ny = ((sy - top) / Math.max(1, bot - top) - 0.4) * 0.8;
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k] - 0.5); x < xs[k + 1] - 0.5 + 1e-6; x++) {
          if (clip && !clip(x, y)) continue;
          const nx = Math.max(-1, Math.min(1, (x + 0.5 - mid) / half)) * 0.92;
          const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny * 0.6));
          this.put(x, y, this.shadeTone(nx, ny, nz));
        }
      }
    }
    return this;
  };
  /* 세부 픽셀: 명암 계산 없이 그 색 그대로 */
  P.dot = function (x, y, color) {
    const k = this.k;
    const x0 = Math.floor(Math.floor(x) * k);
    const y0 = Math.floor(Math.floor(y) * k);
    const x1 = Math.max(x0 + 1, Math.floor((Math.floor(x) + 1) * k));
    const y1 = Math.max(y0 + 1, Math.floor((Math.floor(y) + 1) * k));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h) continue;
        const i = yy * this.w + xx;
        if (!this.mat[i]) {
          this.mat[i] = color;
          this.part[i] = this.pid;
          this.edge[i] = 0;
        }
        this.col[i] = color;
      }
    }
    return this;
  };
  P.line = function (x0, y0, x1, y1, color) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 200; n++) {
      this.dot(x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  };
  P.erase = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    this.mat[i] = null;
    this.col[i] = null;
    this.part[i] = -1;
  };

  P.toCanvas = function (alpha) {
    const w = this.w;
    const h = this.h;
    const out = new Array(w * h).fill(null);
    for (let i = 0; i < w * h; i++) {
      const m = this.mat[i];
      if (!m) continue;
      if (this.col[i]) { out[i] = this.col[i]; continue; }
      let line = false;
      const x = i % w;
      const y = (i / w) | 0;
      const pi = this.part[i];
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) {
        if (j >= 0 && this.mat[j] && this.part[j] > pi && this.edge[j] && !this.col[j]) { line = true; break; }
      }
      const t = this.tone[i];
      out[i] = line ? (t >= 2 ? edgeColor(m) : ramp(m)[3]) : ramp(m)[t];
    }
    const cv = S.makeCanvas(w, h);
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(w, h);
    const a = Math.round((alpha === undefined ? 1 : alpha) * 255);
    for (let i = 0; i < w * h; i++) {
      let c = out[i];
      if (!c) {
        const x = i % w;
        const y = (i / w) | 0;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const j of nb) {
          if (j >= 0 && this.mat[j]) { c = edgeColor(this.col[j] || this.mat[j]); break; }
        }
        if (!c) continue;
      }
      const rgb = toRgb(c);
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  };

  /* ─────────────── 자세 ─────────────── */
  /* 좌표는 프레임(56×64) 안, 발바닥 y=OY+52 근처. side는 왼쪽을 본다 */
  function basePose(view) {
    if (view === "side") {
      return {
        head: [23.5, 18.5], shF: [21.5, 30], shB: [26, 30], hF: [19, 38.5], hB: [27.5, 38], hipF: [23, 40], hipB: [25.5, 40],
        fF: [22, 52], fB: [26.5, 52], torso: [[19.5, 28.5], [28.5, 28.5], [28, 41], [20, 41]], bob: 0, shift: 0, wAng: 0
      };
    }
    return {
      head: [24, 18.5], shF: [17.5, 30], shB: [30.5, 30], hF: [15.8, 38.5], hB: [32.2, 38.5], hipF: [21, 40], hipB: [27, 40],
      fF: [21, 52], fB: [27, 52], torso: [[17, 28.5], [31, 28.5], [29.6, 41], [18.4, 41]], bob: 0, shift: 0, wAng: 0
    };
  }

  function clonePose(p) {
    return JSON.parse(JSON.stringify(p));
  }

  function pose(view, anim, f, weaponUp) {
    const p = basePose(view);
    const side = view === "side";
    const set = (k, x, y) => { p[k] = [x, y]; };
    p.anim = anim;
    switch (anim) {
      case "idle":
        /* 4박자 숨쉬기: 올라갔다 잠깐 머문다 */
        p.bob = [0, 1, 1, 0][f % 4];
        if (side && f % 4 === 2) { p.hF[1] += 0.5; p.hB[1] += 0.5; }
        break;
      case "walk":
        p.bob = f % 2;
        if (side) {
          const A = [[17.5, 52, 29.5, 50.5, 25, 38, 19.5, 37.5], [22, 50.8, 25.5, 52, 21, 38.5, 26, 38], [29.5, 50.5, 17.5, 52, 18, 37.5, 28, 38], [25.5, 52, 22, 50.8, 21, 38.5, 26, 38]][f % 4];
          set("fF", A[0], A[1]); set("fB", A[2], A[3]); set("hF", A[4], A[5]); set("hB", A[6], A[7]);
        } else {
          const A = [[50.5, 52, 37.2, 39.6], [52, 52, 38.5, 38.5], [52, 50.5, 39.6, 37.2], [52, 52, 38.5, 38.5]][f % 4];
          p.fF[1] = A[0]; p.fB[1] = A[1]; p.hF[1] = A[2]; p.hB[1] = A[3];
        }
        break;
      case "jump":
        if (f === 0 || f === 2) { p.bob = 3; set("hF", side ? 22 : 15, 39); set("hB", side ? 28 : 33, 39); }
        else { p.bob = -7; p.fF[1] = 46; p.fB[1] = 47; if (side) { p.fF[0] = 21; p.fB[0] = 27; } set("hF", side ? 18 : 13, 27); set("hB", side ? 28 : 35, 27); }
        break;
      case "fall":
        p.bob = -3;
        if (side) { set("fF", 20, 50); set("fB", 28, 48.5); set("hF", 15.5, 29); set("hB", 30, 28); }
        else { p.fF[1] = 50; p.fB[1] = 50; set("hF", 12, 30); set("hB", 36, 30); }
        break;
      case "land":
        p.bob = 3; set("hF", side ? 19 : 14, 40); set("hB", side ? 29 : 34, 40);
        if (side) { set("fF", 18.5, 52); set("fB", 29, 52); }
        break;
      case "climb":
        /* 등을 보이고 밧줄을 번갈아 잡는다 */
        if (f % 2) { set("hF", 16, 22); set("hB", 32, 29); p.fF[1] = 50; }
        else { set("hF", 16, 29); set("hB", 32, 22); p.fB[1] = 50; }
        break;
      case "windup":
        p.shift = 1; set("hF", 28.5, 25); p.wAng = 35;
        break;
      case "strike":
        p.shift = -3; set("hF", 12, 33); set("fF", 16.5, 52); set("fB", 29, 52); p.wAng = weaponUp ? -90 : -105;
        break;
      case "follow":
        p.shift = -2; set("hF", 15, 41.5); set("fF", 17.5, 52); p.wAng = weaponUp ? -110 : -155;
        break;
      case "cast":
        if (f === 0) { set("hF", 17, 29.5); set("hB", 20, 31); p.wAng = -8; }
        else { p.shift = -1; set("hF", 13.5, 31); set("hB", 18, 31); p.wAng = -40; }
        break;
      case "hurt":
        p.shift = 3; set("hF", 21, 33); set("hB", 30, 32); p.closed = true; p.wAng = 30;
        break;
      case "victory":
        set("hB", 33, 21); p.wAng = 15;
        break;
      default:
        break;
    }
    return p;
  }

  /* ─────────────── 옷차림 ─────────────── */
  const OUTFIT_TYPE = {
    warrior: "tunic", knight: "armor", archer: "tunic", gunner: "coat", rogue: "tunic", assassin: "tunic", elemental: "robe",
    arcane: "robe", dark: "robe", holy: "robe", nature: "robe", spirit: "tunic", martial: "gi", summoner: "robe", bard: "tunic",
    tech: "coat", alchemy: "coat", oriental: "gi", hunter: "coat", sea: "coat", military: "tunic", cosmic: "robe", trickster: "tunic",
    bloodline: "tunic", farming: "overalls", gathering: "tunic", craft: "apron", culinary: "apron", commerce: "coat", scholar: "robe",
    arts: "tunic", medicine: "coat", civic: "coat", service: "apron", building: "overalls", mystic: "robe"
  };
  const CAPE_FAMILY = new Set(["knight", "arcane", "cosmic", "archer", "bard"]);
  const IRIS = [C.lblue, C.brown, C.dgreen, C.purple, C.blue, C.rust];

  function dressOf(job) {
    if (job._dress) return job._dress;
    const look = S.lookOf(job);
    const fam = F.FAMILY_LIST[job.fam];
    const h = S.hash(job.base);
    let type = OUTFIT_TYPE[fam.id] || "tunic";
    if (/수녀|무녀|성녀|하녀|마녀|무희|가희|유모|산파|세이렌/.test(job.base)) type = type === "robe" ? "robe" : "dress";
    if (/기사|철갑|근위|중장/.test(job.base) && fam.id !== "knight") type = "armor";
    const dress = {
      type,
      cape: CAPE_FAMILY.has(fam.id) ? h % 3 !== 0 : job.rarity >= 4 || /왕|군주|장군|뱀파이어|흡혈귀|백작|선장/.test(job.base),
      capeColor: fam.id === "knight" ? (look.c === C.gold ? C.blue : look.c) : S.shade(look.a, 0.75),
      pauldron: type === "armor" || fam.id === "warrior" || fam.id === "military",
      scarf: fam.id === "rogue" || fam.id === "assassin" || /모험|방랑/.test(job.base),
      iris: look.eye !== C.black ? look.eye : IRIS[h % IRIS.length],
      metal: type === "armor"
    };
    job._dress = dress;
    return dress;
  }

  /* ─────────────── 머리 ─────────────── */
  function drawHairBack(P, look, view, hx, hy) {
    if (look.bald) return;
    const hair = look.hair;
    if (look.hairStyle === "long") {
      P.use(hair);
      if (view === "side") P.poly([[hx + 1, hy - 6], [hx + 11, hy - 4], [hx + 12, hy + 18], [hx + 3, hy + 16]]);
      else P.poly([[hx - 11, hy - 4], [hx + 11, hy - 4], [hx + 12.5, hy + 18], [hx - 12.5, hy + 18]]);
    }
    if (look.hairStyle === "tail") {
      P.use(hair);
      if (view === "side") P.capsule(hx + 9, hy - 5, hx + 14, hy + 8, 2.8, 1.6);
      else if (view === "back") P.capsule(hx, hy + 2, hx + 1, hy + 15, 2.6, 1.4);
    }
  }

  function drawHead(P, look, dress, view, hx, hy, closed) {
    const skin = look.skin;
    const hair = look.bald ? look.skin : look.hair;
    // 머리 바탕
    P.use(skin);
    if (view === "side") P.ellipse(hx, hy, 10.2, 10);
    else P.ellipse(hx, hy, 10.6, 10);
    if (look.ears === "elf") {
      P.use(skin);
      if (view === "side") P.poly([[hx + 4, hy + 2], [hx + 7, hy + 1], [hx + 13, hy - 6], [hx + 6, hy + 5]]);
      else { P.poly([[hx - 9, hy + 1], [hx - 16, hy - 5], [hx - 9, hy + 5]]); P.poly([[hx + 9, hy + 1], [hx + 16, hy - 5], [hx + 9, hy + 5]]); }
    }
    if (view === "back") {
      if (!look.bald) { P.use(hair); P.ellipse(hx, hy - 0.5, 11.2, 10.6); }
      return;
    }
    // 머리카락 윗부분
    if (!look.bald) {
      P.use(hair);
      if (view === "side") P.ellipse(hx + 1.2, hy - 1.5, 11, 9.6, (x, y) => y < hy + 1 || x > hx + 1);
      else P.ellipse(hx, hy - 1.8, 11.3, 9.4, (x, y) => y < hy + 0);
    }
    // 얼굴
    P.use(skin);
    if (view === "side") P.ellipse(hx - 2.6, hy + 3.2, 7.6, 7.1);
    else P.ellipse(hx, hy + 3.4, 8.7, 7.2);
    // 앞머리
    if (!look.bald) {
      P.use(hair);
      if (view === "side") {
        P.poly([[hx - 8, hy - 3], [hx - 9, hy + 1], [hx - 6.5, hy - 0.5], [hx - 4.5, hy + 2.5], [hx - 2.5, hy - 1], [hx + 1, hy + 3], [hx + 3, hy - 4], [hx - 2, hy - 8]]);
        P.capsule(hx + 5.5, hy - 2, hx + 5.5, hy + 7, 2.4, 1.6);
      } else {
        P.poly([[hx - 10, hy - 2], [hx - 9.5, hy + 4], [hx - 7, hy + 0], [hx - 5, hy + 3], [hx - 2.5, hy - 0.5], [hx, hy + 2.5], [hx + 2.5, hy - 0.5],
          [hx + 5, hy + 3], [hx + 7, hy + 0], [hx + 9.5, hy + 4], [hx + 10, hy - 2], [hx + 6, hy - 6], [hx - 6, hy - 6]]);
        P.capsule(hx - 9.6, hy + 1, hx - 9.4, hy + 8, 1.9, 1.2);
        P.capsule(hx + 9.6, hy + 1, hx + 9.4, hy + 8, 1.9, 1.2);
      }
      if (look.hairStyle === "spiky") {
        P.use(hair);
        const tips = view === "side" ? [[-6, -11], [-1, -13], [4, -12], [9, -9]] : [[-8, -10], [-3, -13], [3, -13], [8, -10]];
        tips.forEach(([tx, ty]) => P.poly([[hx + tx - 3, hy - 6], [hx + tx, hy + ty], [hx + tx + 3, hy - 6]]));
      }
      if (look.hairStyle === "bun") { P.use(hair); P.ellipse(view === "side" ? hx + 4 : hx, hy - 10.5, 4, 3.4); }
    }
    // 눈
    const iris = dress.iris;
    const dark = "#1a1430";
    const eye = (ex, ey) => {
      if (closed || look.blind) { P.dot(ex, ey + 2, dark).dot(ex + 1, ey + 2, dark); return; }
      P.dot(ex, ey, dark).dot(ex + 1, ey, dark);
      P.dot(ex, ey + 1, dark).dot(ex + 1, ey + 1, iris);
      P.dot(ex, ey + 2, iris).dot(ex + 1, ey + 2, mix(iris, "#ffffff", 0.35));
      P.dot(ex, ey + 1, "#ffffff");
    };
    const mouth = mul(skin, 0.62);
    if (view === "side") {
      eye(Math.floor(hx - 7), Math.floor(hy + 1));
      P.dot(Math.floor(hx - 8), Math.floor(hy + 6), mouth);
      P.dot(Math.floor(hx - 3), Math.floor(hy + 5), mix(skin, C.pink, 0.45));
    } else {
      eye(Math.floor(hx - 5), Math.floor(hy + 1));
      eye(Math.floor(hx + 3), Math.floor(hy + 1));
      P.dot(Math.floor(hx), Math.floor(hy + 6), mouth).dot(Math.floor(hx - 1), Math.floor(hy + 6), mouth);
      P.dot(Math.floor(hx - 7), Math.floor(hy + 5), mix(skin, C.pink, 0.45)).dot(Math.floor(hx + 6), Math.floor(hy + 5), mix(skin, C.pink, 0.45));
    }
    // 얼굴 특징
    const fx = view === "side";
    if (look.beard) {
      P.use(look.hair);
      if (fx) P.poly([[hx - 9, hy + 5], [hx - 1, hy + 4], [hx + 1, hy + 9], [hx - 5, hy + 12], [hx - 9, hy + 9]]);
      else P.poly([[hx - 7.5, hy + 5], [hx + 7.5, hy + 5], [hx + 6, hy + 11], [hx, hy + 14], [hx - 6, hy + 11]]);
    }
    if (look.tusks) {
      if (fx) P.dot(hx - 7, hy + 7, C.white).dot(hx - 7, hy + 6, C.white);
      else P.dot(hx - 3, hy + 6, C.white).dot(hx - 3, hy + 5, C.white).dot(hx + 2, hy + 6, C.white).dot(hx + 2, hy + 5, C.white);
    }
    if (look.glasses) {
      const g = "#2a2440";
      if (fx) { P.line(hx - 9, hy + 0, hx - 5, hy + 0, g).line(hx - 9, hy + 4, hx - 5, hy + 4, g).line(hx - 4, hy + 1, hx - 4, hy + 3, g); }
      else { [-6, 2].forEach((o) => { P.line(hx + o - 1, hy, hx + o + 2, hy, g).line(hx + o - 1, hy + 4, hx + o + 2, hy + 4, g).dot(hx + o - 2, hy + 2, g).dot(hx + o + 3, hy + 2, g); }); }
    }
    if (look.eyepatch) {
      const k = "#1a1430";
      if (fx) { P.line(hx - 8, hy - 1, hx + 4, hy - 3, k); P.dot(hx - 7, hy + 1, k).dot(hx - 6, hy + 1, k).dot(hx - 7, hy + 2, k).dot(hx - 6, hy + 2, k).dot(hx - 7, hy + 3, k).dot(hx - 6, hy + 3, k); }
      else { P.line(hx - 9, hy - 2, hx + 9, hy - 1, k); for (let yy = 1; yy <= 3; yy++) { P.dot(hx + 3, hy + yy, k).dot(hx + 4, hy + yy, k); } }
    }
    if (look.scar) P.line(hx + (fx ? -5 : 3), hy - 1, hx + (fx ? -3 : 6), hy + 4, C.dred);
    if (look.gills) { P.dot(hx + (fx ? 2 : -8), hy + 6, C.teal).dot(hx + (fx ? 2 : -8), hy + 8, C.teal); }
  }

  /* ─────────────── 모자 ─────────────── */
  function hatBehind(P, look, view, hx, hy) {
    const p = look.hatColor || look.a;
    switch (look.hat) {
      case "hood": case "ninja":
        P.use(p); P.ellipse(view === "side" ? hx + 1.5 : hx, hy + 1, 13, 12.4);
        if (view !== "front") P.poly([[hx - 9, hy + 6], [hx + 11, hy + 6], [hx + 13, hy + 15], [hx - 10, hy + 15]]);
        break;
      case "veil":
        P.use(p); P.poly([[hx - 12, hy - 4], [hx + 12, hy - 4], [hx + 14, hy + 18], [hx - 14, hy + 18]]);
        break;
      default:
        break;
    }
  }

  function hat(P, look, view, hx, hy) {
    const p = look.hatColor || look.a;
    const q = look.c;
    const side = view === "side";
    const back = view === "back";
    const gold = C.gold;
    const fx = side ? -1 : 0;
    const name = look.hat;
    const extra = [];
    if (look.ears === "animal" || look.ears === "cat") extra.push(look.ears);
    if (look.horns) extra.push(look.horns === "big" ? "horns" : "smallhorns");
    extra.forEach((e) => {
      if (e === "animal" || e === "cat") {
        P.use(look.hair);
        const ears = side ? [[2, 0]] : [[-6, 0], [6, 0]];
        ears.forEach(([ex]) => {
          P.poly([[hx + ex - 3.5, hy - 7], [hx + ex + (e === "cat" ? 0 : -1), hy - 15], [hx + ex + 3.5, hy - 7]]);
          if (!back) P.dot(hx + ex, hy - 10, C.pink).dot(hx + ex, hy - 9, C.pink);
        });
      } else {
        P.use(look.hornColor || C.black);
        const big = e === "horns";
        const list = side ? [1] : [-1, 1];
        list.forEach((sgn) => {
          const bx = hx + sgn * (side ? 2 : 6);
          if (big) { P.capsule(bx, hy - 7, bx + sgn * 4, hy - 13, 2, 1.4); P.capsule(bx + sgn * 4, hy - 13, bx + sgn * 2, hy - 18, 1.4, 0.7); }
          else P.capsule(bx, hy - 7, bx + sgn * 1.5, hy - 11, 1.6, 0.9);
        });
      }
    });
    if (look.halo || name === "halo") {
      P.use(C.yellow, { edge: 0 }); P.ring(side ? hx + 1 : hx, hy - 13.5, 7, 2.2, 0.35);
    }
    switch (name) {
      case "band":
        P.use(p); P.capsule(hx - 10.4, hy - 3, hx + 10.4, hy - 3, 1.3);
        if (side) P.capsule(hx + 9, hy - 3, hx + 14, hy + 1, 1.1, 0.7);
        break;
      case "bandana":
        P.use(p); P.ellipse(hx + (side ? 1 : 0), hy - 3.5, 11.6, 7.6, (x, y) => y < hy - 1.5);
        P.capsule(hx + (side ? 10 : 8), hy - 2, hx + (side ? 14 : 12), hy + 3, 1.3, 0.8);
        if (!back) P.dot(hx - 4, hy - 5, C.white).dot(hx + 3, hy - 6, C.white);
        break;
      case "hood":
        P.use(p); P.ellipse(hx + (side ? 1.5 : 0), hy - 3.2, 12.2, 8.6, (x, y) => y < hy - 3.5);
        if (!back) {
          if (side) P.capsule(hx + 6, hy - 4, hx + 8, hy + 9, 3, 2.4);
          else { P.capsule(hx - 10.5, hy - 4, hx - 10, hy + 9, 2.4, 2); P.capsule(hx + 10.5, hy - 4, hx + 10, hy + 9, 2.4, 2); }
        } else P.ellipse(hx, hy, 12, 11.5);
        break;
      case "ninja":
        P.use(p); P.ellipse(hx + (side ? 1.5 : 0), hy - 3.2, 12.2, 8.6, (x, y) => y < hy - 1.5);
        if (!back) {
          if (side) { P.capsule(hx + 6, hy - 4, hx + 8, hy + 9, 3, 2.4); P.poly([[hx - 10, hy + 4], [hx + 6, hy + 4], [hx + 6, hy + 11], [hx - 6, hy + 11]]); }
          else { P.capsule(hx - 10.5, hy - 4, hx - 10, hy + 9, 2.4, 2); P.capsule(hx + 10.5, hy - 4, hx + 10, hy + 9, 2.4, 2); P.poly([[hx - 9, hy + 4], [hx + 9, hy + 4], [hx + 7, hy + 11], [hx - 7, hy + 11]]); }
        } else P.ellipse(hx, hy, 12, 11.5);
        P.use(C.red); P.capsule(hx + (side ? 9 : 4), hy - 2, hx + (side ? 16 : 10), hy + 2, 1.1, 0.6);
        break;
      case "plume": {
        P.use(p); P.ellipse(hx + (side ? 1 : 0), hy - 3, 11.8, 9, (x, y) => y < hy - 1.5);
        if (!back) {
          if (side) P.capsule(hx + 5, hy - 2, hx + 6, hy + 7, 2.4, 2);
          else { P.capsule(hx - 10.6, hy - 2, hx - 9.8, hy + 7, 2.2, 1.8); P.capsule(hx + 10.6, hy - 2, hx + 9.8, hy + 7, 2.2, 1.8); }
        } else P.ellipse(hx, hy, 11.8, 11);
        P.use(gold); P.capsule(hx - 11, hy - 2.5, hx + 11, hy - 2.5, 1.1);
        if (!back) P.dot(hx + (side ? -6 : 0), hy - 4, C.lblue);
        P.use(C.red); P.capsule(hx + (side ? 2 : 0), hy - 11, hx + (side ? 9 : 2), hy - 15, 2.2, 1.5); P.capsule(hx + (side ? 9 : 2), hy - 15, hx + (side ? 15 : 3), hy - 9, 1.6, 0.8);
        break;
      }
      case "helm": {
        P.use(p); P.ellipse(hx + (side ? 0.5 : 0), hy - 1, 11.6, 11);
        if (!back) {
          P.use("#1a1430", { edge: 0 });
          if (side) P.poly([[hx - 12, hy], [hx + 1, hy], [hx + 1, hy + 2], [hx - 12, hy + 2]]);
          else P.poly([[hx - 8, hy], [hx + 8, hy], [hx + 8, hy + 2], [hx - 8, hy + 2]]);
          P.use(p); if (!side) P.capsule(hx, hy - 9, hx, hy + 9, 0.8);
          const glint = side ? [hx - 8, hy + 1] : [hx - 4, hy + 1];
          P.dot(glint[0], glint[1], C.cyan).dot(glint[0] + (side ? 0 : 7), glint[1], C.cyan);
        }
        P.use(gold); P.capsule(hx - (side ? 10 : 11), hy + 7, hx + 11, hy + 7, 1.1);
        break;
      }
      case "hornhelm":
        P.use(p); P.ellipse(hx + (side ? 1 : 0), hy - 2.5, 11.6, 8.6, (x, y) => y < hy - 1);
        P.use(gold); P.capsule(hx - 11, hy - 2, hx + 11, hy - 2, 1.1);
        P.use(C.sand);
        (side ? [1] : [-1, 1]).forEach((s) => { const bx = hx + s * (side ? 4 : 9); P.capsule(bx, hy - 6, bx + s * 4, hy - 11, 2, 1.5); P.capsule(bx + s * 4, hy - 11, bx + s * 3, hy - 17, 1.5, 0.6); });
        break;
      case "wizard": case "witch": {
        const tipX = side ? hx + 8 : hx + 5;
        P.use(p); P.poly([[hx - 8, hy - 7], [hx + 8, hy - 7], [tipX + 2, hy - 18], [tipX + (name === "witch" ? 7 : 4), hy - 23], [tipX - 3, hy - 17]]);
        P.use(q); P.capsule(hx - 8.5, hy - 8, hx + 8.5, hy - 8, 1.2);
        P.use(p); P.ellipse(hx + (side ? -1 : 0), hy - 6.5, name === "witch" ? 17 : 15, 3.6);
        P.dot(tipX + 1, hy - 14, C.yellow).dot(tipX + 2, hy - 15, C.yellow).dot(tipX, hy - 15, C.yellow).dot(tipX + 1, hy - 16, C.yellow).dot(tipX + 1, hy - 15, C.white);
        break;
      }
      case "mitre":
        P.use(p); P.poly([[hx - 6.5, hy - 7], [hx + 6.5, hy - 7], [hx + 6, hy - 17], [hx, hy - 23], [hx - 6, hy - 17]]);
        P.use(gold, { edge: 0 }); P.capsule(hx, hy - 20, hx, hy - 10, 0.9); P.capsule(hx - 3, hy - 16, hx + 3, hy - 16, 0.9);
        P.use(gold); P.capsule(hx - 7, hy - 7.5, hx + 7, hy - 7.5, 1.1);
        break;
      case "veil":
        P.use(p); P.ellipse(hx, hy - 3, 12.4, 8.6, (x, y) => y < hy - 3.5);
        P.use(C.white); P.capsule(hx - 10.5, hy - 4, hx + 10.5, hy - 4, 1.4);
        if (!back) { P.use(p); P.capsule(hx - 11, hy - 3, hx - 11.5, hy + 10, 2.4); if (!side) P.capsule(hx + 11, hy - 3, hx + 11.5, hy + 10, 2.4); }
        break;
      case "leaves":
        P.use(C.dgreen); P.capsule(hx - 10.5, hy - 4, hx + 10.5, hy - 4, 1.4);
        [-9, -5, -1, 3, 7].forEach((o, i) => { P.use(i % 2 ? C.green : C.dgreen); P.ellipse(hx + o + 1, hy - 7, 2.4, 1.6); });
        P.dot(hx - 2, hy - 8, C.pink).dot(hx + 5, hy - 8, C.yellow);
        break;
      case "antlers":
        P.use(C.leather);
        [-1, 1].forEach((s) => { if (side && s < 0) return; const bx = hx + s * (side ? 3 : 6); P.capsule(bx, hy - 7, bx + s * 4, hy - 16, 1.3, 0.9); P.capsule(bx + s * 3, hy - 12, bx + s * 8, hy - 15, 1, 0.7); P.capsule(bx + s * 4, hy - 16, bx + s * 2, hy - 20, 0.9, 0.6); });
        break;
      case "feathers":
        P.use(q === C.gold ? C.red : q); P.capsule(hx - 10.5, hy - 4, hx + 10.5, hy - 4, 1.5);
        [-8, -4, 0, 4, 8].forEach((o, i) => { P.use(i % 2 ? C.white : C.red); P.ellipse(hx + o + (side ? 2 : 0), hy - 11 + Math.abs(o) * 0.4, 1.8, 5); });
        break;
      case "featherCap":
        P.use(p); P.ellipse(hx + (side ? 0.5 : 0), hy - 4, 11.4, 7.6, (x, y) => y < hy - 2);
        P.use(p); P.ellipse(hx + (side ? -3 : 0), hy - 3, side ? 12 : 12.5, 2.6);
        P.use(C.white); P.capsule(hx + (side ? 3 : 4), hy - 8, hx + (side ? 13 : 12), hy - 15, 1.8, 0.7);
        P.use(C.red); P.capsule(hx + (side ? 4 : 5), hy - 8, hx + (side ? 9 : 9), hy - 13, 1, 0.6);
        break;
      case "goggles":
        P.use(C.brown); P.capsule(hx - 10.5, hy - 4, hx + 10.5, hy - 4, 1.2);
        P.use(C.gold); (side ? [-6] : [-4, 4]).forEach((o) => P.ellipse(hx + o, hy - 5, 2.8, 2.6));
        P.use(C.cyan, { edge: 0 }); (side ? [-6] : [-4, 4]).forEach((o) => P.ellipse(hx + o, hy - 5, 1.6, 1.5));
        (side ? [-6] : [-4, 4]).forEach((o) => P.dot(hx + o - 1, hy - 6, C.white));
        break;
      case "straw":
        P.use(p); P.ellipse(hx + (side ? -1 : 0), hy - 7.5, 15.5, 3.4);
        P.use(p); P.ellipse(hx, hy - 10, 8.6, 5.4, (x, y) => y < hy - 8.5);
        P.use(C.red); P.capsule(hx - 8.2, hy - 9, hx + 8.2, hy - 9, 0.9);
        break;
      case "hardhat": case "lamphat":
        P.use(p); P.ellipse(hx + (side ? 0.5 : 0), hy - 4, 11.6, 8.4, (x, y) => y < hy - 2);
        P.use(p); P.ellipse(hx + (side ? -3 : 0), hy - 2.5, side ? 13.5 : 13, 2);
        if (name === "lamphat") { P.use(C.lgrey); P.ellipse(hx + (side ? -8 : 0), hy - 7, 2.6, 2.4); P.dot(hx + (side ? -9 : -1), hy - 8, C.white); P.dot(hx + (side ? -9 : 0), hy - 7, C.yellow); }
        else { P.use(C.white, { edge: 0 }); P.capsule(hx, hy - 11, hx, hy - 4, 0.9); }
        break;
      case "chef":
        P.use(C.white); P.ellipse(hx - 4, hy - 13, 5, 4.6); P.ellipse(hx + 4, hy - 13, 5, 4.6); P.ellipse(hx, hy - 15, 5.4, 5);
        P.use(C.white); P.poly([[hx - 8, hy - 12], [hx + 8, hy - 12], [hx + 8, hy - 5], [hx - 8, hy - 5]]);
        P.use(C.lgrey); P.capsule(hx - 8.5, hy - 5.5, hx + 8.5, hy - 5.5, 1.1);
        break;
      case "tophat":
        P.use(p); P.poly([[hx - 6, hy - 8], [hx + 6, hy - 8], [hx + 6.5, hy - 21], [hx - 6.5, hy - 21]]);
        P.use(q); P.capsule(hx - 6.3, hy - 10, hx + 6.3, hy - 10, 1.2);
        P.use(p); P.ellipse(hx, hy - 7.5, 11.5, 2.4);
        break;
      case "tricorn":
        P.use(p); P.poly([[hx - 15, hy - 6], [hx - 8, hy - 15], [hx, hy - 12], [hx + 8, hy - 15], [hx + 15, hy - 6], [hx, hy - 4]]);
        P.use(C.gold, { edge: 0 }); P.line(hx - 14, hy - 6, hx, hy - 4, C.gold).line(hx, hy - 4, hx + 14, hy - 6, C.gold);
        if (!back) P.dot(hx, hy - 10, C.white).dot(hx - 1, hy - 9, C.white).dot(hx + 1, hy - 9, C.white).dot(hx, hy - 8, C.white);
        break;
      case "cowboy":
        P.use(p); P.ellipse(hx, hy - 6, 17, 3.6);
        P.use(p); P.poly([[hx - 8, hy - 7], [hx + 8, hy - 7], [hx + 7, hy - 15], [hx + 2, hy - 13], [hx - 2, hy - 15], [hx - 7, hy - 15]]);
        P.use(C.dbrown); P.capsule(hx - 8, hy - 8.5, hx + 8, hy - 8.5, 1.1);
        break;
      case "cap":
        P.use(p); P.ellipse(hx + (side ? 1 : 0), hy - 4, 11.4, 7.8, (x, y) => y < hy - 2);
        P.use(q); if (side) P.ellipse(hx - 9, hy - 2.6, 6, 1.8); else P.ellipse(hx, hy - 2.2, 9, 2);
        break;
      case "crown":
        P.use(C.gold); P.poly([[hx - 8, hy - 7], [hx + 8, hy - 7], [hx + 9, hy - 15], [hx + 5, hy - 11], [hx + 2, hy - 17], [hx, hy - 12], [hx - 2, hy - 17], [hx - 5, hy - 11], [hx - 9, hy - 15]]);
        P.dot(hx, hy - 10, C.red).dot(hx - 5, hy - 9, C.lblue).dot(hx + 5, hy - 9, C.green).dot(hx, hy - 11, C.pink);
        break;
      case "jester":
        P.use(C.red); P.poly([[hx - 10, hy - 6], [hx, hy - 9], [hx - 9, hy - 16], [hx - 16, hy - 11]]);
        P.use(C.yellow); P.poly([[hx + 10, hy - 6], [hx, hy - 9], [hx + 9, hy - 16], [hx + 16, hy - 11]]);
        P.use(C.gold); P.ellipse(hx - 16, hy - 10, 1.8, 1.8); P.ellipse(hx + 16, hy - 10, 1.8, 1.8);
        P.use(C.purple); P.capsule(hx - 10, hy - 6, hx + 10, hy - 6, 1.4);
        break;
      case "beret":
        P.use(p); P.ellipse(hx + 1, hy - 6, 12, 4.6);
        P.dot(hx + 1, hy - 11, mul(p, 0.6));
        break;
      case "kasa":
        P.use(p); P.poly([[hx - 17, hy - 4], [hx, hy - 16], [hx + 17, hy - 4], [hx, hy - 3]]);
        P.use(C.brown, { edge: 0 }); P.line(hx - 15, hy - 5, hx + 15, hy - 5, C.brown);
        break;
      case "mortar":
        P.use(C.black); P.ellipse(hx, hy - 5, 10, 5, (x, y) => y < hy - 3);
        P.use(C.black); P.poly([[hx - 14, hy - 10], [hx, hy - 14], [hx + 14, hy - 10], [hx, hy - 6]]);
        P.use(C.gold, { edge: 0 }); P.capsule(hx + 1, hy - 10, hx + 9, hy - 6, 0.6); P.capsule(hx + 9, hy - 6, hx + 9, hy - 1, 0.8);
        break;
      case "nurse":
        P.use(C.white); P.poly([[hx - 6, hy - 8], [hx + 6, hy - 8], [hx + 5, hy - 13], [hx - 5, hy - 13]]);
        P.dot(hx, hy - 11, C.red).dot(hx - 1, hy - 10, C.red).dot(hx, hy - 10, C.red).dot(hx + 1, hy - 10, C.red).dot(hx, hy - 9, C.red);
        break;
      case "maid":
        P.use(C.white); [-7, -3.5, 0, 3.5, 7].forEach((o) => P.ellipse(hx + o, hy - 8.5 + Math.abs(o) * 0.2, 2.2, 2));
        break;
      case "turban":
        P.use(p); P.ellipse(hx, hy - 6, 11.8, 6.6); P.use(mul(p, 0.85)); P.ellipse(hx, hy - 10, 8.6, 4.6);
        P.use(C.gold); P.ellipse(hx, hy - 6, 1.8, 2); P.dot(hx, hy - 7, C.red);
        break;
      case "skullmask":
        if (!back) {
          P.use(C.sand); if (side) P.ellipse(hx - 4, hy + 3, 6.5, 6.5); else P.ellipse(hx, hy + 3, 8.4, 7);
          const k = "#1a1430";
          if (side) P.dot(hx - 7, hy + 2, k).dot(hx - 6, hy + 2, k).dot(hx - 7, hy + 3, k);
          else [-4, 2].forEach((o) => { P.dot(hx + o, hy + 2, k).dot(hx + o + 1, hy + 2, k).dot(hx + o, hy + 3, k).dot(hx + o + 1, hy + 3, k); });
        }
        break;
      default:
        break;
    }
  }

  /* ─────────────── 들고 있는 물건 ─────────────── */
  function weapon(P, look, kind, hx, hy, ang) {
    const a = (ang * Math.PI) / 180;
    const s = Math.sin(a);
    const c = Math.cos(a);
    const T = (lx, ly) => [hx + lx * c - ly * s, hy + lx * s + ly * c];
    const seg = (x1, y1, x2, y2, r, col, r2) => { const A = T(x1, y1); const B = T(x2, y2); P.use(col); P.capsule(A[0], A[1], B[0], B[1], r, r2); };
    const pg = (pts, col) => { P.use(col); P.poly(pts.map((p) => T(p[0], p[1]))); };
    const el = (x, y, rx, ry, col, opts) => { const A = T(x, y); P.use(col, opts); P.ellipse(A[0], A[1], rx, ry); };
    const dt = (x, y, col) => { const A = T(x, y); P.dot(A[0], A[1], col); };
    const steel = C.lgrey;
    const wood = C.leather;
    const gold = C.gold;
    const gem = S.EL_COLOR[look.el] || C.red;
    switch (kind) {
      case "sword":
        seg(0, 3, 0, -1, 1.1, C.brown); el(0, 3.8, 1.3, 1.3, gold); seg(-3.6, -1.6, 3.6, -1.6, 1.1, gold);
        pg([[-1.7, -2.4], [1.7, -2.4], [1.4, -14], [0, -17.5], [-1.4, -14]], steel); dt(-0.5, -6, C.white); dt(-0.5, -9, C.white);
        break;
      case "katana":
        seg(0, 4, 0, -1, 1, C.black); el(0, -1.4, 2.2, 1, gold);
        pg([[-1, -2.2], [1.2, -2.2], [2, -12], [1.6, -18], [0, -19], [-0.6, -13]], steel); dt(0.4, -8, C.white);
        break;
      case "greatsword":
        seg(0, 5, 0, -1, 1.2, C.brown); el(0, 5.5, 1.5, 1.5, gold); seg(-5, -1.8, 5, -1.8, 1.4, gold);
        pg([[-2.6, -2.6], [2.6, -2.6], [2.3, -19], [0, -23], [-2.3, -19]], steel); seg(0, -4, 0, -18, 0.5, C.white);
        break;
      case "dagger": case "needle":
        seg(0, 2.5, 0, -0.5, 0.9, C.brown); seg(-2, -1, 2, -1, 0.8, gold);
        pg(kind === "needle" ? [[-0.6, -1.5], [0.6, -1.5], [0, -11]] : [[-1.3, -1.6], [1.3, -1.6], [0, -9]], steel);
        break;
      case "axe": case "bigaxe":
        seg(0, 5, 0, -14, 1.1, wood);
        pg([[-0.5, -13], [-6.5, -17], [-7.5, -11.5], [-6.5, -6], [-0.5, -9]], steel);
        if (kind === "bigaxe") pg([[0.5, -13], [6.5, -17], [7.5, -11.5], [6.5, -6], [0.5, -9]], steel);
        dt(-6, -12, C.white);
        break;
      case "spear": case "harpoon": case "glaive":
        seg(0, 9, 0, -18, 1, wood);
        if (kind === "glaive") pg([[-1, -17], [1.6, -17], [2.6, -24], [-0.5, -28], [-2.5, -22]], steel);
        else pg([[-2, -17], [2, -17], [0, -25]], steel);
        if (kind === "harpoon") { seg(-2, -19, -3.5, -16.5, 0.6, steel); seg(2, -19, 3.5, -16.5, 0.6, steel); }
        else seg(-1.8, -16.2, 1.8, -16.2, 0.9, C.red);
        break;
      case "hammer": case "trowel":
        seg(0, 4, 0, -11, 1.1, wood);
        if (kind === "trowel") pg([[0, -10], [3.5, -14], [0, -18], [-3.5, -14]], steel);
        else { pg([[-5, -16], [5, -16], [5, -10.5], [-5, -10.5]], steel); dt(-4, -15, C.white); }
        break;
      case "mace": case "club":
        seg(0, 4, 0, -9, 1.1, kind === "club" ? wood : C.brown);
        if (kind === "club") seg(0, -8, 0, -14, 2.4, wood, 3);
        else { el(0, -12, 3.4, 3.4, steel); [[-4, -12], [4, -12], [0, -16], [0, -8]].forEach(([x, y]) => dt(x, y, steel)); }
        break;
      case "scythe":
        seg(0, 10, 0, -16, 1, wood);
        pg([[0, -16], [-3, -19], [-11, -18], [-14, -14], [-8, -16], [-1, -14]], steel);
        break;
      case "whip":
        seg(0, 2, 0, -3, 1, C.brown); P.use(C.brown, { edge: 0 });
        { const A = T(-2, -7); P.ring(A[0], A[1], 4, 4, 0.55); }
        break;
      case "bow":
        P.use(wood);
        [[0.5, -12, -2.5, -8], [-2.5, -8, -3.5, 0], [-3.5, 0, -2.5, 8], [-2.5, 8, 0.5, 12]].forEach(([x1, y1, x2, y2]) => { const A = T(x1, y1); const B = T(x2, y2); P.use(wood); P.capsule(A[0], A[1], B[0], B[1], 1.1); });
        { const A = T(1, -12); const B = T(1, 12); P.line(A[0], A[1], B[0], B[1], C.sand); }
        el(-3.4, 0, 1.4, 1.6, C.brown);
        break;
      case "crossbow":
        seg(0, 4, 0, -8, 1.4, wood); seg(-5.5, -6, 5.5, -6, 1, steel);
        { const A = T(-5.5, -6); const B = T(0, 0); const D = T(5.5, -6); P.line(A[0], A[1], B[0], B[1], C.sand).line(B[0], B[1], D[0], D[1], C.sand); }
        break;
      case "gun":
        seg(1, 3, 1, -0.5, 1.3, wood); seg(0, -0.5, 0, -8, 1.3, steel); dt(0, -8, C.black);
        break;
      case "rifle":
        pg([[-1.6, 2], [1.6, 2], [2, 8], [-2, 8]], wood); seg(0, 2, 0, -14, 1.1, steel); dt(0, -14, C.black);
        break;
      case "cannon":
        seg(0, 6, 0, -9, 3.2, C.dgrey); el(0, -9.5, 3.6, 3.6, C.slate); dt(0, -10, C.black);
        break;
      case "bomb":
        el(0, -3, 3.6, 3.6, C.slate); seg(0, -6.5, 1.5, -9, 0.6, C.sand); dt(2, -10, C.yellow); dt(3, -10, C.orange);
        break;
      case "staff": case "wand":
        if (kind === "wand") seg(0, 3, 0, -8, 0.8, wood); else seg(0, 11, 0, -14, 1.1, wood);
        if (kind === "staff") { el(0, -14.5, 2.6, 1.5, gold); seg(-2.4, -15, -1.6, -19.5, 0.6, gold); seg(2.4, -15, 1.6, -19.5, 0.6, gold); }
        el(0, kind === "wand" ? -10 : -17.5, 2.6, 2.6, gem);
        dt(-1, kind === "wand" ? -11 : -18.5, C.white);
        P.glow.push([T(0, kind === "wand" ? -10 : -17), gem]);
        break;
      case "holystaff":
        seg(0, 11, 0, -14, 1, C.white); seg(0, -13, 0, -22, 1.2, gold); seg(-3.4, -18, 3.4, -18, 1.2, gold); el(0, -18, 1.3, 1.3, C.lblue, { edge: 0 });
        P.glow.push([T(0, -18), C.yellow]);
        break;
      case "skullstaff":
        seg(0, 11, 0, -13, 1, C.dbrown); el(0, -16, 3.2, 3, C.sand);
        dt(-1.2, -16, C.black); dt(1.2, -16, C.black); dt(-1.2, -16.6, C.green); P.glow.push([T(0, -16), C.green]);
        break;
      case "starstaff":
        seg(0, 11, 0, -14, 1, gold);
        pg([[0, -24], [1.6, -19.5], [6, -19], [2.6, -16.4], [3.6, -12], [0, -14.6], [-3.6, -12], [-2.6, -16.4], [-6, -19], [-1.6, -19.5]], C.yellow);
        P.glow.push([T(0, -18), C.yellow]);
        break;
      case "leafstaff":
        seg(0, 11, 0, -16, 1.1, C.brown); el(-2.5, -15, 2.2, 1.4, C.green); el(2.5, -17, 2.2, 1.4, C.dgreen); el(0, -19, 1.8, 2.4, C.green);
        dt(0, -21, C.pink);
        break;
      case "totem":
        seg(0, 11, 0, -12, 1.1, wood); pg([[-3, -12], [3, -12], [3, -20], [-3, -20]], C.rust);
        dt(-1.4, -17, C.yellow); dt(1.4, -17, C.yellow); dt(0, -14, C.black); dt(-1, -14, C.black); dt(1, -14, C.black);
        break;
      case "book":
        pg([[-4, -5], [4, -5], [4, 4], [-4, 4]], look.c === C.white ? C.dred : look.c);
        pg([[-3, -4], [3, -4], [3, -3], [-3, -3]], C.white); dt(0, 0, C.gold); dt(-1, 0, C.gold); dt(1, 0, C.gold); dt(0, -1, C.gold); dt(0, 1, C.gold);
        break;
      case "lute":
        seg(0, -2, 0, -10, 0.9, C.brown); el(0, 2, 3.4, 4.2, wood); dt(0, 1, C.dbrown); dt(0, 2, C.dbrown);
        break;
      case "drum":
        el(0, 0, 4.4, 3.4, C.red); el(0, -2, 4.4, 1.6, C.white); dt(-3, 0, C.gold); dt(3, 0, C.gold);
        break;
      case "horn":
        seg(0, 2, -2, -4, 1, gold); seg(-2, -4, -5, -6, 1.6, gold, 2.4);
        break;
      case "cards":
        [-3, 0, 3].forEach((o, i) => pg([[o - 1.6, -5], [o + 1.6, -5 - i * 0.5], [o + 1.6, 0], [o - 1.6, 0]], C.white));
        dt(-3, -3, C.red); dt(0, -3, C.black); dt(3, -3, C.red);
        break;
      case "dice":
        pg([[-4, -3], [0, -3], [0, 1], [-4, 1]], C.white); pg([[0.5, -6], [4.5, -6], [4.5, -2], [0.5, -2]], C.white);
        dt(-2, -1, C.black); dt(2.5, -4, C.red);
        break;
      case "flask": case "potion":
        seg(0, -4, 0, -7, 0.9, C.lgrey); el(0, -1, 3.2, 3.4, C.lgrey); el(0, 0, 2.2, 2.2, kind === "potion" ? C.dred : gem, { edge: 0 });
        dt(-1, -2, C.white); P.glow.push([T(0, 0), kind === "potion" ? C.red : gem]);
        break;
      case "orb":
        pg([[-3, 2], [3, 2], [2, 0], [-2, 0]], gold); el(0, -3.5, 3.6, 3.6, C.lblue, { edge: 0 }); dt(-1, -5, C.white);
        P.glow.push([T(0, -3.5), C.cyan]);
        break;
      case "lantern":
        seg(0, 0, 0, -2, 0.6, C.black); pg([[-2.6, -2], [2.6, -2], [2.6, 5], [-2.6, 5]], C.black); el(0, 1.5, 1.6, 2.4, C.yellow, { edge: 0 });
        P.glow.push([T(0, 1.5), C.yellow]);
        break;
      case "coinbag":
        el(0, 2, 3.6, 3.4, C.leather); seg(-1, -1.5, 1, -1.5, 0.9, C.brown); dt(0, 2, C.gold); dt(-1, 2, C.gold); dt(1.5, -3.5, C.gold);
        break;
      case "medkit":
        pg([[-4, -3], [4, -3], [4, 4], [-4, 4]], C.white); seg(-2, 0.5, 2, 0.5, 0.7, C.red); seg(0, -1.5, 0, 2.5, 0.7, C.red);
        break;
      case "fan":
        pg([[0, 2], [-6, -6], [-3, -8], [0, -8.5], [3, -8], [6, -6]], look.c); dt(0, -5, C.white); dt(-3, -5, C.white); dt(3, -5, C.white);
        break;
      case "shuriken":
        pg([[0, -6], [1, -1], [6, 0], [1, 1], [0, 6], [-1, 1], [-6, 0], [-1, -1]], steel);
        break;
      case "boomerang":
        seg(-5, -6, 0, 0, 1.2, wood); seg(0, 0, 5, -6, 1.2, wood);
        break;
      case "quill":
        seg(0, 3, 1, -8, 0.6, C.black); el(1.5, -6, 1.6, 4.6, C.white);
        break;
      case "brush":
        seg(0, 6, 0, -7, 0.9, wood); seg(0, -7, 0, -9, 1, steel); el(0, -11, 1.4, 2.4, look.c === C.white ? C.red : look.c);
        break;
      case "claws":
        [-2, 0, 2].forEach((o) => seg(o, -1, o * 1.6, -8, 0.7, steel, 0.3));
        break;
      case "fist":
        el(0, -0.5, 2.6, 2.6, C.lgrey);
        break;
      case "pitchfork":
        seg(0, 9, 0, -14, 1, wood); seg(-3.5, -14, 3.5, -14, 0.9, steel);
        [-3.5, 0, 3.5].forEach((o) => seg(o, -14, o, -20, 0.7, steel, 0.4));
        break;
      case "pickaxe":
        seg(0, 6, 0, -12, 1, wood); pg([[-8, -10], [-4, -14], [0, -14.5], [4, -14], [8, -10], [4, -12.5], [-4, -12.5]], steel);
        break;
      case "shovel":
        seg(0, 8, 0, -9, 1, wood); seg(-2, 8, 2, 8, 0.8, wood); pg([[-3, -9], [3, -9], [3, -15], [0, -17], [-3, -15]], steel);
        break;
      case "rod":
        seg(0, 6, 0, -18, 0.7, wood); { const A = T(0, -18); const B = T(-6, -6); P.line(A[0], A[1], B[0], B[1], C.lgrey); } el(-6, -5, 1.2, 1.2, C.red);
        break;
      case "pan": case "ladle":
        seg(0, 3, 0, -6, 0.9, C.brown);
        if (kind === "pan") el(0, -10, 4.6, 4.2, C.slate); else el(0, -9, 2.6, 2.2, C.lgrey);
        break;
      case "broom":
        seg(0, -9, 0, 6, 0.9, wood); pg([[-3, 6], [3, 6], [4.5, 13], [-4.5, 13]], C.sand); seg(-3, 7.5, 3, 7.5, 0.6, C.red);
        break;
      case "wrench":
        seg(0, 4, 0, -8, 1.1, C.lgrey); pg([[-3, -8], [3, -8], [3, -13], [1, -13], [1, -10], [-1, -10], [-1, -13], [-3, -13]], C.lgrey);
        break;
      case "anchor":
        seg(0, 4, 0, -12, 1, C.grey); seg(-4, -9, 4, -9, 0.9, C.grey); P.use(C.grey); { const A = T(0, 4); P.ring(A[0], A[1], 5, 3, 0.4); }
        el(0, -13, 1.6, 1.6, C.grey);
        break;
      default:
        seg(0, 3, 0, -10, 1, steel);
    }
  }

  function shield(P, look, x, y, side) {
    const col = look.c === C.gold ? C.blue : look.c;
    P.use(C.gold);
    const pts = side ? [[x - 3.5, y - 6], [x + 3.5, y - 6], [x + 3.5, y + 2], [x, y + 7], [x - 3.5, y + 2]] : [[x - 5, y - 6], [x + 5, y - 6], [x + 5, y + 2], [x, y + 8], [x - 5, y + 2]];
    P.poly(pts);
    P.use(col);
    P.poly(pts.map(([px, py]) => [x + (px - x) * 0.72, y + (py - y) * 0.72 - 0.3]));
    P.dot(x, y - 2, C.white).dot(x, y - 1, C.white).dot(x - 1, y - 1, C.white).dot(x + 1, y - 1, C.white).dot(x, y, C.white);
  }

  /* ─────────────── 몸통 ─────────────── */
  function drawLeg(P, look, dress, hip, foot, bob) {
    const pants = dress.type === "armor" ? C.grey : look.b;
    P.use(pants); P.capsule(hip[0], hip[1] + bob, foot[0], foot[1] - 3, 2.5, 2.2);
    P.use(look.boots); P.capsule(foot[0], foot[1] - 4.5, foot[0], foot[1] - 1.2, 2.6);
    P.use(look.boots); P.ellipse(foot[0] - 0.5, foot[1] - 0.8, 3.2, 1.7);
  }

  function drawArm(P, look, dress, sh, hand, bob, sleeve) {
    const col = sleeve || (dress.type === "armor" ? look.a : look.a);
    P.use(col); P.capsule(sh[0], sh[1] + bob, hand[0], hand[1] + bob - 1, 2.2, 1.9);
  }

  function drawHand(P, look, hand, bob, gauntlet) {
    P.use(gauntlet ? C.lgrey : look.skin); P.ellipse(hand[0], hand[1] + bob, 2, 2);
  }

  function drawTorso(P, look, dress, view, p, bob) {
    const t = p.torso.map(([x, y]) => [x + p.shift, y + bob]);
    const side = view === "side";
    const a = look.a;
    const b = look.b;
    const c = look.c;
    const left = t[3][0];
    const right = t[2][0];
    const waist = t[2][1];
    switch (dress.type) {
      case "robe": case "dress": {
        const flare = dress.type === "dress" ? 5 : 4;
        P.use(dress.type === "dress" ? b : a);
        P.poly([[t[0][0], t[0][1]], [t[1][0], t[1][1]], [right + flare, 50 + 0.5], [left - flare, 50 + 0.5]]);
        P.use(c, { edge: 0 }); P.capsule(left - flare + 0.5, 49.5, right + flare - 0.5, 49.5, 0.8);
        if (dress.type === "dress") { P.use(C.white, { edge: 0 }); P.poly([[left + 2, waist], [right - 2, waist], [right, 48], [left, 48]]); }
        P.use(a); P.poly([[t[0][0], t[0][1]], [t[1][0], t[1][1]], [right, waist], [left, waist]]);
        P.use(c, { edge: 0 }); P.capsule(left + 0.5, waist - 0.5, right - 0.5, waist - 0.5, 0.9);
        if (!side) P.capsule((left + right) / 2, t[0][1] + 1, (left + right) / 2, waist - 1, 0.6);
        break;
      }
      case "armor": {
        P.use(a); P.poly(t);
        P.use(mul(a, 0.92)); P.ellipse((t[0][0] + t[1][0]) / 2 + (side ? -1 : 0), t[0][1] + 5, side ? 4 : 5.5, 4);
        P.use(C.gold, { edge: 0 }); P.capsule(left + 0.5, waist - 0.8, right - 0.5, waist - 0.8, 0.9);
        P.use(b); P.poly([[left, waist], [right, waist], [right + 1.5, waist + 5], [left - 1.5, waist + 5]]);
        break;
      }
      case "coat": {
        P.use(a); P.poly([[left - 0.5, waist - 2], [right + 0.5, waist - 2], [right + 2.5, 47], [left - 2.5, 47]]);
        P.use(a); P.poly(t);
        P.use(c === a ? C.white : c, { edge: 0 }); if (!side) { P.capsule((left + right) / 2, t[0][1] + 1, (left + right) / 2, 46, 0.6); } else P.capsule(left + 1, t[0][1] + 1, left - 1.5, 46, 0.6);
        P.use(C.brown, { edge: 0 }); P.capsule(left + 0.5, waist - 1, right - 0.5, waist - 1, 0.9);
        P.dot((left + right) / 2, waist - 1, C.gold);
        break;
      }
      case "apron": {
        P.use(a); P.poly(t);
        P.use(b === a ? C.white : b); P.poly([[left + 2, t[0][1] + 4], [right - 2, t[0][1] + 4], [right, 47], [left, 47]]);
        P.use(c, { edge: 0 }); P.capsule(left + 0.5, waist - 1, right - 0.5, waist - 1, 0.7);
        break;
      }
      case "overalls": {
        P.use(c === C.sand ? C.white : c); P.poly(t);
        P.use(b); P.poly([[left + 2, t[0][1] + 4], [right - 2, t[0][1] + 4], [right, waist + 1], [left, waist + 1]]);
        P.use(b, { edge: 0 }); if (!side) { P.capsule(left + 2.5, t[0][1], left + 2.5, t[0][1] + 4, 0.7); P.capsule(right - 2.5, t[0][1], right - 2.5, t[0][1] + 4, 0.7); }
        P.dot(left + 3, t[0][1] + 5, C.gold); P.dot(right - 3, t[0][1] + 5, C.gold);
        break;
      }
      case "gi": {
        P.use(a); P.poly(t);
        if (!side) { P.use(C.white, { edge: 0 }); P.line((left + right) / 2 - 3, t[0][1], (left + right) / 2, t[0][1] + 6, mul(a, 0.6)); P.line((left + right) / 2 + 3, t[0][1], (left + right) / 2, t[0][1] + 6, mul(a, 0.6)); }
        P.use(c); P.capsule(left + 0.5, waist - 1, right - 0.5, waist - 1, 1.1);
        P.use(c, { edge: 0 }); P.capsule(left + 3, waist, left + 2, waist + 4, 0.7);
        break;
      }
      default: {
        P.use(a); P.poly(t);
        P.use(a); P.poly([[left, waist - 1], [right, waist - 1], [right + 1, waist + 3], [left - 1, waist + 3]]);
        P.use(C.brown, { edge: 0 }); P.capsule(left + 0.5, waist - 1, right - 0.5, waist - 1, 0.9);
        P.dot((left + right) / 2, waist - 1, C.gold);
      }
    }
    if (dress.scarf) {
      P.use(C.red); P.capsule(left + 1, t[0][1] + 1, right - 1, t[0][1] + 1, 1.6);
      if (side) P.capsule(right - 1, t[0][1] + 1, right + 5, t[0][1] + 5, 1.2, 0.7);
    }
  }

  function drawCape(P, look, dress, view, p, bob) {
    if (!dress.cape) return;
    P.use(dress.capeColor);
    const sx = p.shift;
    if (view === "side") P.poly([[24 + sx, 29 + bob], [28.5 + sx, 29 + bob], [33 + sx, 49], [29 + sx, 50.5], [25 + sx, 49]]);
    else if (view === "front") P.poly([[16 + sx, 29 + bob], [32 + sx, 29 + bob], [35.5 + sx, 50], [12.5 + sx, 50]]);
    else {
      P.poly([[16 + sx, 28.5 + bob], [32 + sx, 28.5 + bob], [35.5 + sx, 50.5], [31, 49.5], [24, 50.5], [17, 49.5], [12.5 + sx, 50.5]]);
      P.use(look.c, { edge: 0 }); P.capsule(16 + sx, 29 + bob, 32 + sx, 29 + bob, 1);
    }
  }

  function drawWings(P, look, view, bob) {
    if (!look.wings) return;
    const col = look.wings;
    P.use(col);
    if (view === "side") {
      P.poly([[27, 30 + bob], [38, 20 + bob], [44, 22 + bob], [40, 30 + bob], [42, 36 + bob], [32, 38 + bob]]);
    } else {
      P.poly([[20, 31 + bob], [6, 20 + bob], [2, 24 + bob], [6, 31 + bob], [3, 37 + bob], [16, 38 + bob]]);
      P.poly([[28, 31 + bob], [42, 20 + bob], [46, 24 + bob], [42, 31 + bob], [45, 37 + bob], [32, 38 + bob]]);
    }
  }

  /* 무기 기본 각도: 평소에는 세워 들거나(지팡이·창·활) 아래로 늘어뜨린다(검·도끼) */
  const UPRIGHT = new Set(["staff", "wand", "holystaff", "skullstaff", "starstaff", "leafstaff", "totem", "spear", "harpoon", "glaive", "pitchfork", "scythe", "bow", "rod", "broom", "lantern", "orb", "flask", "potion", "book", "lute", "drum", "horn", "cards", "dice", "coinbag", "medkit", "bomb", "fan", "quill", "brush", "fist", "claws"]);
  const AIMED = new Set(["gun", "rifle", "cannon", "crossbow"]);

  function weaponAngle(kind, p, view) {
    if (p.anim === "windup" || p.anim === "strike" || p.anim === "follow" || p.anim === "cast" || p.anim === "hurt" || p.anim === "victory") return p.wAng;
    if (AIMED.has(kind)) return view === "side" ? -100 : 160;
    if (UPRIGHT.has(kind)) return view === "side" ? -8 : 6;
    return view === "side" ? -155 : 170;
  }

  /* ─────────────── 조립 ─────────────── */
  function drawDoll(job, view, anim, f, k) {
    const look = S.lookOf(job);
    const dress = dressOf(job);
    const kind = look.shield ? "sword" : look.weapon;
    const up = UPRIGHT.has(kind) || AIMED.has(kind);
    const p = pose(view, anim, f, up);
    const P = new Painter(FW, FH, k);
    const bob = p.bob;
    const sx = p.shift;
    const sh = (pt) => [pt[0] + sx + OX, pt[1] + OY];
    const shB = sh(p.shB);
    const shF = sh(p.shF);
    const hF = sh(p.hF);
    const hB = sh(p.hB);
    const hip = (pt) => [pt[0] + OX + sx * 0.5, pt[1] + OY];
    const foot = (pt) => [pt[0] + OX, pt[1] + OY];
    const head = [p.head[0] + sx + OX, p.head[1] + OY + bob];
    const tp = clonePose(p);
    tp.torso = tp.torso.map(([x, y]) => [x + OX, y + OY]);
    tp.shift = sx;
    const gauntlet = dress.type === "armor";
    const ang = weaponAngle(kind, p, view);
    const holdBack = view !== "side" && anim === "victory";

    // 날개·망토(뒤)
    drawWings(P, look, view, bob);
    if (view !== "back") drawCape(P, look, dress, view, { shift: sx }, bob);
    drawHairBack(P, look, view, head[0], head[1]);
    hatBehind(P, look, view, head[0], head[1]);

    if (view === "side") {
      drawArm(P, look, dress, shB, hB, bob);
      drawHand(P, look, hB, bob, gauntlet);
      drawLeg(P, look, dress, hip(p.hipB), foot(p.fB), bob);
      drawLeg(P, look, dress, hip(p.hipF), foot(p.fF), bob);
      if (look.shield) weapon(P, look, "sword", shB[0] + 2, shB[1] - 2 + bob, 20);
      drawTorso(P, look, dress, view, tp, bob);
      if (dress.pauldron) { P.use(dress.type === "armor" ? look.a : C.grey); P.ellipse(shF[0] + 0.5, shF[1] + bob, 3.6, 3); }
      drawHead(P, look, dress, view, head[0], head[1], p.closed);
      hat(P, look, view, head[0], head[1]);
      drawArm(P, look, dress, shF, hF, bob);
      if (look.shield) { shield(P, look, hF[0] - 1, hF[1] + bob - 1, true); }
      else { weapon(P, look, kind, hF[0], hF[1] + bob, ang); drawHand(P, look, hF, bob, gauntlet); }
    } else if (view === "front") {
      drawLeg(P, look, dress, hip(p.hipF), foot(p.fF), bob);
      drawLeg(P, look, dress, hip(p.hipB), foot(p.fB), bob);
      drawTorso(P, look, dress, view, tp, bob);
      if (dress.pauldron) { P.use(dress.type === "armor" ? look.a : C.grey); P.ellipse(shF[0], shF[1] + bob, 3.6, 3); P.ellipse(shB[0], shB[1] + bob, 3.6, 3); }
      drawArm(P, look, dress, shF, hF, bob);
      drawArm(P, look, dress, shB, hB, bob);
      drawHead(P, look, dress, view, head[0], head[1], p.closed);
      hat(P, look, view, head[0], head[1]);
      const wh = holdBack ? hB : hB;
      if (look.shield) { shield(P, look, hF[0], hF[1] + bob - 2, false); drawHand(P, look, hB, bob, gauntlet); weapon(P, look, "sword", hB[0], hB[1] + bob, ang); }
      else { weapon(P, look, kind, wh[0], wh[1] + bob, ang); drawHand(P, look, hF, bob, gauntlet); }
      drawHand(P, look, hB, bob, gauntlet);
    } else {
      if (look.shield) weapon(P, look, "sword", shB[0] + 1, shB[1] + bob, -15);
      else weapon(P, look, kind, hF[0], hF[1] + bob, ang);
      drawLeg(P, look, dress, hip(p.hipF), foot(p.fF), bob);
      drawLeg(P, look, dress, hip(p.hipB), foot(p.fB), bob);
      drawTorso(P, look, dress, view, tp, bob);
      drawArm(P, look, dress, shF, hF, bob);
      drawArm(P, look, dress, shB, hB, bob);
      drawHand(P, look, hF, bob, gauntlet);
      drawHand(P, look, hB, bob, gauntlet);
      drawCape(P, look, dress, view, { shift: sx }, bob);
      drawHead(P, look, dress, view, head[0], head[1], p.closed);
      hat(P, look, view, head[0], head[1]);
      if (look.shield) shield(P, look, shF[0] + 6, shF[1] + 6 + bob, false);
    }
    const cv = P.toCanvas(look.ghost ? 0.72 : 1);
    return { cv, glow: P.glow };
  }

  const cache = new Map();
  const CACHE_MAX = 2400;
  /* view: down|up|left|right, anim: idle|walk|jump|fall|land|climb|windup|strike|follow|cast|hurt|victory */
  function frame(job, dir, anim, f, scale) {
    const k = scale || 1;
    const key = `${job.id}|${dir}|${anim}|${f}|${k}`;
    let hit = cache.get(key);
    if (hit) return hit;
    const view = dir === "down" ? "front" : dir === "up" ? "back" : "side";
    const res = drawDoll(job, view, anim, f || 0, k);
    const w = res.cv.width;
    const h = res.cv.height;
    res.glow = res.glow.map(([pt, col]) => [[pt[0] * k, pt[1] * k], col]);
    if (dir === "right") {
      const m = S.makeCanvas(w, h);
      const ctx = m.getContext("2d");
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(res.cv, 0, 0);
      res.cv = m;
      res.glow = res.glow.map(([pt, col]) => [[w - pt[0], pt[1]], col]);
    }
    hit = { cv: res.cv, glow: res.glow, ax: Math.round(28 * k), ay: Math.round(56 * k), w, h };
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, hit);
    return hit;
  }

  F.doll = { frame, dressOf, ramp, mix, mul, FW, FH, Painter };
})(typeof window !== "undefined" ? window : globalThis);
