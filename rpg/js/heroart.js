/*
 * 삼천의 운명 — 주인공 그림과 동작
 * 미리 그린 캐릭터 그림(오른쪽을 봄)을 원하는 키로 줄여 두고, 발밑을 축으로 기울이기·늘이기·눌림으로
 * 대기(숨쉬기)·걷기·점프·낙하·착지·공격(뒤로 젖혔다 내지르기)·시전·피격 동작을 만든다.
 * 같은 그림을 쓰는 직업끼리 달라 보이도록 heroes.lookOf가 정한 대로 옷 색과 피부색을 바꾸고,
 * 날개·고리·뿔·귀·왕관·분신·기운을 덧그린다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const H = F.heroes;
  const TAU = Math.PI * 2;
  const clock = () => (root.performance ? root.performance.now() : Date.now()) / 1000;

  const images = {};
  function src(id) {
    return (F.HERO_ART && F.HERO_ART[id]) || `assets/heroes/${id}.webp`;
  }
  function image(id) {
    let img = images[id];
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.onerror = () => { img.failed = true; };
      img.src = src(id);
      images[id] = img;
    }
    return img;
  }
  function preload() {
    H.ART.forEach(([id]) => image(id));
  }
  const ready = (img) => img.complete && img.naturalWidth > 0;
  function canvas(w, h) {
    return F.sprites.makeCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  }

  /* ── 색 ── */
  function toHsv(r, g, b, out) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d + 6) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    out[0] = h / 6;
    out[1] = mx ? d / mx : 0;
    out[2] = mx / 255;
  }
  function toRgb(h, s, v, out) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    const k = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
    out[0] = Math.round(k[0] * 255);
    out[1] = Math.round(k[1] * 255);
    out[2] = Math.round(k[2] * 255);
  }
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

  /* ── 그림 분석: 픽셀을 피부(1)·무채색(2)·색(3)으로 나누고, 얼굴 위치·머리 꼭대기·주된 옷 색을 찾는다 ──
     아직 못 읽었으면 null, 픽셀을 읽을 수 없으면(교차 출처) false */
  const infos = {};
  function analyze(id) {
    if (infos[id] !== undefined) return infos[id];
    const img = image(id);
    if (!ready(img)) return null;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const cv = canvas(w, h);
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    let data;
    try { data = g.getImageData(0, 0, w, h).data; } catch (e) { infos[id] = false; return false; }
    const kind = new Uint8Array(w * h);
    const c = [0, 0, 0];
    let vx = 0;
    let vy = 0;
    const fx = [];
    const fy = [];
    const sk = [0, 0, 0, 0];
    let bodyX = 0;
    let bodyN = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const p = i * 4;
        if (data[p + 3] < 60) continue;
        const r = data[p];
        const gg = data[p + 1];
        const b = data[p + 2];
        toHsv(r, gg, b, c);
        if (c[1] < 0.13 || c[2] < 0.15) kind[i] = 2;
        else if ((c[0] < 0.115 || c[0] > 0.955) && c[1] > 0.06 && c[1] < 0.6 && c[2] > 0.52 && r >= gg && gg >= b * 0.85) {
          kind[i] = 1;
          if (y < h * 0.6) { fx.push(x); fy.push(y); sk[0] += r; sk[1] += gg; sk[2] += b; sk[3]++; }
        } else {
          kind[i] = 3;
          const wt = c[1] * c[2];
          vx += Math.cos(c[0] * TAU) * wt;
          vy += Math.sin(c[0] * TAU) * wt;
        }
        if (y > h * 0.35 && y < h * 0.8) { bodyX += x; bodyN++; }
      }
    }
    const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
    /* 얼굴: 위쪽 피부 픽셀의 중심 가까이에 모인 덩어리(손은 떨어져 있어 빠진다) */
    let face = null;
    if (fx.length > 30) {
      const mx = pct(fx.slice().sort((a, b) => a - b), 0.5);
      const my = pct(fy.slice().sort((a, b) => a - b), 0.5);
      const R = Math.max(w, h) * 0.17;
      const xs = [];
      const ys = [];
      fx.forEach((x, k) => { if (Math.abs(x - mx) < R && Math.abs(fy[k] - my) < R) { xs.push(x); ys.push(fy[k]); } });
      if (xs.length > 30) {
        xs.sort((a, b) => a - b);
        ys.sort((a, b) => a - b);
        const fw = Math.min(w * 0.3, Math.max(w * 0.14, pct(xs, 0.92) - pct(xs, 0.08)));
        face = { x: pct(xs, 0.5), y: pct(ys, 0.5), w: fw, top: pct(ys, 0.06) };
      }
    }
    const bare = !!face;
    if (!face) face = { x: w * 0.5, y: h * 0.28, w: w * 0.24, top: h * 0.16 };
    /* 머리 꼭대기: 얼굴 위 기둥에서 가장 높은 불투명 픽셀(모자 포함) */
    let top = face.top;
    const x0 = Math.max(0, Math.round(face.x - face.w * 0.4));
    const x1 = Math.min(w - 1, Math.round(face.x + face.w * 0.4));
    for (let y = 0; y < face.top && top === face.top; y++) {
      for (let x = x0; x <= x1; x++) if (data[(y * w + x) * 4 + 3] > 100) { top = y; break; }
    }
    /* 머리카락(4): 얼굴 위 띠와 얼굴 양옆에서 피부가 아닌 픽셀. 짙은 외곽선은 그대로 둔다 */
    for (let y = Math.max(0, Math.round(face.top - face.w * 0.5)); y < Math.min(h, Math.round(face.y + face.w * 0.25)); y++) {
      const band = y <= face.top + face.w * 0.25;
      for (let x = Math.max(0, Math.round(face.x - face.w * 0.8)); x <= Math.min(w - 1, Math.round(face.x + face.w * 0.8)); x++) {
        const i = y * w + x;
        const dx = Math.abs(x - face.x);
        if (!band && (dx < face.w * 0.38 || dx > face.w * 0.75)) continue;
        if (kind[i] !== 2 && kind[i] !== 3) continue;
        const p = i * 4;
        const mx = Math.max(data[p], data[p + 1], data[p + 2]);
        /* 짙은 외곽선과 흰 모자·머리띠는 빼고 */
        if (mx < 46 || (kind[i] === 2 && mx > 190)) continue;
        kind[i] = 4;
      }
    }
    /* 머리카락 색: 얼굴 바로 위 띠의 평균 */
    const hc = [0, 0, 0, 0];
    for (let y = Math.max(0, Math.round(face.top - face.w * 0.25)); y < face.top; y++) {
      for (let x = x0; x <= x1; x++) {
        const p = (y * w + x) * 4;
        if (data[p + 3] > 150 && kind[y * w + x] !== 1) { hc[0] += data[p]; hc[1] += data[p + 1]; hc[2] += data[p + 2]; hc[3]++; }
      }
    }
    infos[id] = {
      w, h, kind, face, top, bare,
      dom: (((Math.atan2(vy, vx) / TAU) % 1) + 1) % 1,
      body: bodyN ? bodyX / bodyN : w * 0.46,
      hair: hc[3] ? hex(hc[0] / hc[3], hc[1] / hc[3], hc[2] / hc[3]) : "#4a3428",
      skin: sk[3] ? hex(sk[0] / sk[3], sk[1] / sk[3], sk[2] / sk[3]) : "#f4d0b8"
    };
    return infos[id];
  }

  /* ── 옷·피부 색 바꾸기 (원래 크기에서 한 번) ── */
  /* [색상, 원래 채도에 곱할 값, 더할 채도, 밝기 배율] */
  const SKINS = {
    orc: [0.25, 0.35, 0.2, 0.84], goblin: [0.2, 0.35, 0.24, 0.9], troll: [0.53, 0.2, 0.1, 0.85], demon: [0.99, 0.5, 0.22, 0.9],
    undead: [0.3, 0.15, 0.04, 0.8], dark: [0.72, 0.2, 0.08, 0.6], lizard: [0.36, 0.3, 0.16, 0.82]
  };
  /* 머리카락 [색상, 채도, 밝기 배율] */
  const HAIRS = {
    black: [0.68, 0.18, 0.45], blonde: [0.12, 0.5, 1.45], white: [0.6, 0.04, 1.7], red: [0.01, 0.7, 1.05], blue: [0.6, 0.55, 1.1],
    pink: [0.93, 0.4, 1.35], silver: [0.58, 0.1, 1.45], green: [0.4, 0.45, 0.95], purple: [0.78, 0.45, 0.95], orange: [0.07, 0.75, 1.2],
    brown: [0.07, 0.55, 0.75], teal: [0.48, 0.5, 1.0]
  };
  const lookKey = (lk) => (lk.pal ? `${lk.pal.h},${lk.pal.s || 1},${lk.pal.v || 1}` : "-") + "|" + (lk.skin || "-") + "|" + (lk.hair || "-");
  const baked = new Map();
  function bake(id, lk) {
    const key = id + "#" + lookKey(lk);
    const hit = baked.get(key);
    if (hit) return hit;
    const img = image(id);
    const inf = analyze(id);
    if (inf === null) return null;
    if (!inf || (!lk.pal && !lk.skin && !lk.hair)) { baked.set(key, img); return img; }
    const cv = canvas(inf.w, inf.h);
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, inf.w, inf.h);
    const d = im.data;
    const pal = lk.pal;
    const dh = pal ? pal.h / 360 - inf.dom : 0;
    const ps = pal ? pal.s || 1 : 1;
    const pv = pal ? pal.v || 1 : 1;
    const nv = 1 + (pv - 1) * 0.6;
    const sk = lk.skin ? SKINS[lk.skin] : null;
    const hr = lk.hair ? HAIRS[lk.hair] : null;
    const c = [0, 0, 0];
    for (let i = 0, n = inf.w * inf.h; i < n; i++) {
      const k = inf.kind[i];
      if (!k) continue;
      const p = i * 4;
      if (k === 4 && hr) {
        toHsv(d[p], d[p + 1], d[p + 2], c);
        toRgb(hr[0], Math.min(1, hr[1] * (0.6 + c[1] * 0.6)), Math.min(1, c[2] * hr[2]), c);
      } else if ((k === 3 || k === 4) && pal) {
        toHsv(d[p], d[p + 1], d[p + 2], c);
        toRgb((((c[0] + dh) % 1) + 1) % 1, Math.min(1, c[1] * ps), Math.min(1, c[2] * pv), c);
      } else if (k === 2 && pal) {
        /* 검정·회색 옷과 쇠붙이도 옅게 물들인다(외곽선과 흰색은 그대로) */
        toHsv(d[p], d[p + 1], d[p + 2], c);
        const v = Math.min(1, c[2] * nv);
        if (c[2] >= 0.17 && c[2] < 0.78) toRgb(pal.h / 360, Math.min(0.42, 0.3 * ps), v, c);
        else if (c[2] >= 0.07 && c[2] < 0.17) toRgb(pal.h / 360, Math.min(0.55, 0.45 * ps), Math.min(1, v * 1.25 + 0.05), c);
        else toRgb(c[0], c[1], v, c);
      } else if (k === 1 && sk) {
        toHsv(d[p], d[p + 1], d[p + 2], c);
        toRgb(sk[0], Math.min(1, c[1] * sk[1] + sk[2]), Math.min(1, c[2] * sk[3]), c);
      } else continue;
      d[p] = c[0];
      d[p + 1] = c[1];
      d[p + 2] = c[2];
    }
    g.putImageData(im, 0, 0);
    if (baked.size > 400) baked.clear();
    baked.set(key, cv);
    return cv;
  }

  /* 원하는 키(px)로 부드럽게 줄인 그림. 줄이기는 한 번만 한다 */
  const scaled = new Map();
  function sprite(job, heightPx) {
    const id = H.heroArtId(job);
    const lk = H.lookOf(job);
    const base = bake(id, lk);
    if (!base) return null;
    const hpx = Math.max(8, Math.round(heightPx));
    const key = `${id}#${lookKey(lk)}@${hpx}`;
    let cv = scaled.get(key);
    if (!cv) {
      const bw = base.naturalWidth || base.width;
      const bh = base.naturalHeight || base.height;
      cv = canvas((bw * hpx) / bh, hpx);
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(base, 0, 0, cv.width, cv.height);
      if (scaled.size > 300) scaled.clear();
      scaled.set(key, cv);
    }
    return cv;
  }

  /* 단색으로 덮은 그림(피격·유령·분신)과 둘레 빛(등급) */
  const tints = new WeakMap();
  function tinted(cv, col, a) {
    let m = tints.get(cv);
    if (!m) tints.set(cv, (m = new Map()));
    const key = col + a;
    let out = m.get(key);
    if (!out) {
      out = canvas(cv.width, cv.height);
      const g = out.getContext("2d");
      g.drawImage(cv, 0, 0);
      g.globalCompositeOperation = "source-atop";
      g.globalAlpha = a;
      g.fillStyle = col;
      g.fillRect(0, 0, out.width, out.height);
      m.set(key, out);
    }
    return out;
  }
  const glows = new WeakMap();
  function glow(cv, col) {
    let out = glows.get(cv);
    if (!out || out.col !== col) {
      const pad = Math.max(3, Math.round(cv.height * 0.05));
      out = canvas(cv.width + pad * 2, cv.height + pad * 2);
      const g = out.getContext("2d");
      g.shadowColor = col;
      g.shadowBlur = pad;
      g.drawImage(cv, pad, pad);
      g.drawImage(cv, pad, pad);
      g.shadowBlur = 0;
      g.globalCompositeOperation = "destination-out";
      g.drawImage(cv, pad, pad);
      out.col = col;
      out.pad = pad;
      glows.set(cv, out);
    }
    return out;
  }

  /* 동작별 변형. t는 그 동작에 들어선 뒤 흐른 초 */
  function motion(anim, t, f) {
    const m = { rot: 0, sx: 1, sy: 1, dx: 0, dy: 0 };
    switch (anim) {
      case "walk": {
        const ph = t * 9.5;
        m.dy = -Math.abs(Math.sin(ph)) * 0.035;
        m.rot = Math.sin(ph) * 0.045;
        m.sy = 1 + Math.cos(ph * 2) * 0.012;
        break;
      }
      case "jump": m.sy = 1.07; m.sx = 0.94; m.rot = -0.08; break;
      case "fall": m.sy = 1.03; m.sx = 0.98; m.rot = 0.05; break;
      case "land": m.sy = 0.86; m.sx = 1.1; break;
      case "windup": m.rot = 0.13; m.dx = -0.05; m.sy = 0.98; break;
      case "strike": m.rot = -0.17; m.dx = 0.09; m.sx = 1.05; break;
      case "follow": m.rot = -0.07; m.dx = 0.05; break;
      case "cast":
        if (f) { m.rot = -0.07; m.dx = 0.04; m.sx = 1.03; }
        else { m.rot = 0.06; m.dy = -0.02; m.sy = 1.02; }
        break;
      case "hurt": m.rot = 0.2; m.dx = -0.06; m.sy = 0.96; break;
      case "climb": m.dx = Math.sin(t * 9) * 0.02; m.rot = Math.sin(t * 9) * 0.035; m.dy = -Math.abs(Math.cos(t * 9)) * 0.015; break;
      case "victory": m.dy = -Math.abs(Math.sin(t * 6)) * 0.05; m.sy = 1.03; break;
      default: {
        const b = Math.sin(t * 2.6);
        m.sy = 1 + b * 0.018;
        m.sx = 1 - b * 0.01;
      }
    }
    return m;
  }

  /* ── 덧그림. 좌표는 그림의 발밑이 (0,0)인 로컬 좌표(오른쪽을 봄) ── */
  function anchors(inf, cv) {
    const ax = Math.round(cv.width * 0.46);
    const ref = inf || { w: cv.width, h: cv.height, face: { x: cv.width * 0.5, y: cv.height * 0.28, w: cv.width * 0.3, top: cv.height * 0.16 }, top: cv.height * 0.03, body: cv.width * 0.46, hair: "#4a3428", skin: "#f4d0b8" };
    const k = cv.height / ref.h;
    const X = (x) => x * k - ax;
    const Y = (y) => y * k - cv.height;
    return {
      ax, H: cv.height, W: cv.width,
      fx: X(ref.face.x), fy: Y(ref.face.y), fw: ref.face.w * k, ftop: Y(ref.face.top), top: Y(ref.top),
      bx: X(ref.body), hair: ref.hair, skin: ref.skin, bare: !!ref.bare
    };
  }

  const WING_COL = {
    angel: ["#ffffff", "#e4f0ff", "#a8c4e4"], phoenix: ["#fff09a", "#ffa63a", "#e0481a"],
    bat: ["#5a2a6a", "#3a1840", "#1c0a22"], dragon: ["#e0503a", "#a8281e", "#5a1010"], fairy: ["#c8f8ff", "#9fe0ff", "#ffffff"]
  };
  /* 날개(오른쪽을 보는 캐릭터의 등에서 왼쪽 위로 펼침). s는 날개 길이 */
  const BAT_TIPS = [[-1.02, -0.5], [-0.92, 0.0], [-0.62, 0.2], [-0.2, 0.2]];
  function batShape(c, s) {
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(-0.42 * s, -0.8 * s);
    c.lineTo(BAT_TIPS[0][0] * s, BAT_TIPS[0][1] * s);
    for (let k = 1; k < BAT_TIPS.length; k++) {
      const [ax, ay] = BAT_TIPS[k - 1];
      const [bx, by] = BAT_TIPS[k];
      /* 손가락 사이 막은 안쪽으로 오목하게 */
      c.quadraticCurveTo(((ax + bx) / 2) * 0.72 * s, ((ay + by) / 2) * 0.72 * s - 0.04 * s, bx * s, by * s);
    }
    c.closePath();
  }
  /* 깃털 날개: 날개 앞쪽 뼈대(곡선)를 따라 깃털을 매단다. 끝으로 갈수록 길다 */
  function featherWing(c, s, col, lw) {
    const bez = (t) => {
      const u = 1 - t;
      return [2 * u * t * (-0.1 * s) + t * t * (-0.95 * s), 2 * u * t * (-0.9 * s) + t * t * (-0.72 * s)];
    };
    const feather = (t, len, wid, fill) => {
      const [x, y] = bez(t);
      c.save();
      c.translate(x, y);
      c.rotate(Math.PI * 0.6 + t * 0.45);
      c.beginPath();
      c.moveTo(0, -wid);
      c.quadraticCurveTo(len * 0.6, -wid * 1.15, len, 0);
      c.quadraticCurveTo(len * 0.6, wid * 1.15, 0, wid);
      c.closePath();
      c.fillStyle = fill;
      c.fill();
      c.stroke();
      c.restore();
    };
    c.strokeStyle = "rgba(50,60,100,0.7)";
    c.lineWidth = lw;
    for (let k = 7; k >= 0; k--) { const t = 0.2 + k * 0.115; feather(t, s * (0.38 + 0.5 * t), s * 0.1, col[k % 2 ? 1 : 2]); }
    for (let k = 7; k >= 0; k--) { const t = 0.12 + k * 0.12; feather(t, s * (0.22 + 0.25 * t), s * 0.09, col[k % 2 ? 0 : 1]); }
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(-0.1 * s, -0.9 * s, -0.95 * s, -0.72 * s);
    c.lineWidth = lw * 2.4;
    c.strokeStyle = col[0];
    c.stroke();
  }
  function wings(c, kind, A, T) {
    const col = WING_COL[kind];
    const fairy = kind === "fairy";
    const feathered = kind === "angel" || kind === "phoenix";
    const span = A.H * (fairy ? 0.4 : feathered ? 0.5 : 0.5);
    const flap = Math.sin(T * (fairy ? 10 : 3)) * (fairy ? 0.2 : 0.08);
    const x = A.bx - A.W * 0.05;
    const y = A.fy + (A.H + A.fy) * 0.32;
    const lw = Math.max(1, A.H * 0.008);
    c.save();
    c.translate(x, y);
    [[-0.28, false], [0.05, true]].forEach(([tilt, near]) => {
      c.save();
      c.rotate(tilt - flap);
      if (!near) c.scale(0.86, 0.86);
      if (fairy) {
        c.globalAlpha *= 0.6;
        c.fillStyle = col[near ? 0 : 1];
        c.strokeStyle = col[2];
        c.lineWidth = lw;
        c.beginPath();
        c.ellipse(-span * 0.5, -span * 0.42, span * 0.52, span * 0.3, -0.5, 0, TAU);
        c.fill();
        c.stroke();
        c.beginPath();
        c.ellipse(-span * 0.38, span * 0.08, span * 0.3, span * 0.18, 0.4, 0, TAU);
        c.fill();
        c.stroke();
        c.restore();
        return;
      }
      if (feathered) {
        featherWing(c, span, near ? col : [col[1], col[2], col[2]], lw);
        c.restore();
        return;
      }
      batShape(c, span);
      const g = c.createLinearGradient(0, -span * 0.8, -span, span * 0.2);
      g.addColorStop(0, col[near ? 0 : 1]);
      g.addColorStop(1, col[near ? 1 : 2]);
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = col[2];
      c.lineWidth = lw * 1.4;
      c.stroke();
      /* 날개뼈 */
      c.strokeStyle = col[0];
      c.lineWidth = lw;
      c.beginPath();
      BAT_TIPS.forEach(([tx, ty]) => { c.moveTo(-0.42 * span, -0.8 * span); c.lineTo(tx * span, ty * span); });
      c.stroke();
      c.restore();
    });
    c.restore();
  }


  function halo(c, A, T) {
    const y = A.top - A.H * 0.05 + Math.sin(T * 2) * A.H * 0.008;
    const rx = A.fw * 0.42;
    c.save();
    c.lineWidth = Math.max(2, A.H * 0.03);
    c.strokeStyle = "rgba(255,230,120,0.35)";
    c.beginPath();
    c.ellipse(A.fx, y, rx, rx * 0.3, 0, 0, TAU);
    c.stroke();
    c.lineWidth = Math.max(1, A.H * 0.012);
    c.strokeStyle = "#fff2a8";
    c.stroke();
    c.restore();
  }

  function horns(c, kind, A) {
    const tusk = kind === "tusk";
    const col = kind === "dragon" ? ["#efe2c0", "#b8a07a"] : tusk ? ["#f4ecd8", "#c8b890"] : ["#3a2a44", "#1a1020"];
    const L = A.fw * (tusk ? 0.32 : 0.62);
    c.save();
    c.lineWidth = Math.max(1, A.H * 0.006);
    c.strokeStyle = "rgba(20,12,24,0.8)";
    [-1, 1].forEach((sg) => {
      if (tusk) {
        /* 엄니: 입가에서 위로 */
        const bx = A.fx + sg * A.fw * 0.2;
        const by = A.fy + A.fw * 0.24;
        c.fillStyle = col[0];
        c.beginPath();
        c.moveTo(bx - L * 0.25, by);
        c.quadraticCurveTo(bx + sg * L * 0.1, by - L * 0.4, bx + sg * L * 0.2, by - L);
        c.quadraticCurveTo(bx + sg * L * 0.35, by - L * 0.3, bx + L * 0.25, by);
        c.closePath();
        c.fill();
        c.stroke();
        return;
      }
      const head = Math.max(A.top, A.ftop - A.fw * 0.75);
      const bx = A.fx + sg * A.fw * 0.36;
      const by = head + (A.ftop - head) * 0.4;
      const g = c.createLinearGradient(bx, by, bx + sg * L * 0.5, by - L);
      g.addColorStop(0, col[1]);
      g.addColorStop(1, col[0]);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(bx - L * 0.22, by);
      c.quadraticCurveTo(bx + sg * L * 0.05, by - L * 0.7, bx + sg * L * 0.55, by - L);
      c.quadraticCurveTo(bx + sg * L * 0.25, by - L * 0.45, bx + L * 0.22, by);
      c.closePath();
      c.fill();
      c.stroke();
    });
    c.restore();
  }

  function ears(c, kind, A) {
    c.save();
    c.lineWidth = Math.max(1, A.H * 0.006);
    c.strokeStyle = "rgba(20,12,24,0.75)";
    if (kind === "elf") {
      c.fillStyle = A.skin;
      [-1, 1].forEach((sg) => {
        const bx = A.fx + sg * A.fw * 0.46;
        const by = A.fy - A.fw * 0.02;
        c.beginPath();
        c.moveTo(bx, by - A.fw * 0.1);
        c.lineTo(bx + sg * A.fw * 0.36, by - A.fw * 0.3);
        c.lineTo(bx, by + A.fw * 0.1);
        c.closePath();
        c.fill();
        c.stroke();
      });
    } else {
      const tall = kind === "wolf" ? 0.5 : 0.4;
      [-1, 1].forEach((sg) => {
        const bx = A.fx + sg * A.fw * 0.32;
        const by = A.top + A.fw * 0.2;
        const hgt = A.fw * tall;
        c.fillStyle = A.hair;
        c.beginPath();
        c.moveTo(bx - A.fw * 0.17, by);
        c.lineTo(bx + sg * A.fw * 0.08, by - hgt);
        c.lineTo(bx + A.fw * 0.17, by);
        c.closePath();
        c.fill();
        c.stroke();
        c.fillStyle = "#f2a0b0";
        c.beginPath();
        c.moveTo(bx - A.fw * 0.08, by - hgt * 0.12);
        c.lineTo(bx + sg * A.fw * 0.06, by - hgt * 0.72);
        c.lineTo(bx + A.fw * 0.08, by - hgt * 0.12);
        c.closePath();
        c.fill();
      });
    }
    c.restore();
  }

  function crown(c, A) {
    const w = A.fw * 0.5;
    const h = w * 0.55;
    const x = A.fx - w / 2;
    const y = A.top + h * 0.35;
    c.save();
    c.fillStyle = "#ffd447";
    c.strokeStyle = "#7a4a10";
    c.lineWidth = Math.max(1, A.H * 0.006);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x, y - h * 0.55);
    c.lineTo(x + w * 0.22, y - h * 0.25);
    c.lineTo(x + w * 0.5, y - h);
    c.lineTo(x + w * 0.78, y - h * 0.25);
    c.lineTo(x + w, y - h * 0.55);
    c.lineTo(x + w, y);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = "#ff3a5a";
    c.beginPath();
    c.arc(x + w * 0.5, y - h * 0.28, Math.max(1, w * 0.09), 0, TAU);
    c.fill();
    c.restore();
  }

  /* ── 몸 주위 기운: 시간만으로 위치가 정해지는 작은 입자들(상태를 저장하지 않는다) ── */
  const AURA = {
    fire: { col: ["#ff5a1f", "#ffb347", "#ffe08a"], mode: "rise", n: 9, shape: "dot" },
    ice: { col: ["#dff6ff", "#8fd8ff", "#ffffff"], mode: "fall", n: 8, shape: "flake" },
    bolt: { col: ["#fff59a", "#ffe14a", "#9fe8ff"], mode: "spark", n: 4 },
    earth: { col: ["#c8a070", "#9a7048", "#e0c090"], mode: "orbit", n: 6, shape: "rock" },
    wind: { col: ["#d8fff4", "#8ff0d0"], mode: "swirl", n: 7, shape: "streak" },
    light: { col: ["#fff6c0", "#ffe27a", "#ffffff"], mode: "rise", n: 8, shape: "star" },
    dark: { col: ["#7b4fb0", "#4a2470", "#a070e0"], mode: "smoke", n: 7 },
    nature: { col: ["#7ed957", "#4fb34a", "#c8f08a"], mode: "fall", n: 7, shape: "leaf" },
    arcane: { col: ["#d58cff", "#9f6bff", "#ffc0ff"], mode: "orbit", n: 6, shape: "diamond" },
    gold: { col: ["#ffd75e", "#fff3b0"], mode: "rise", n: 7, shape: "star" },
    dream: { col: ["#ffb8e8", "#c8b8ff", "#ffffff"], mode: "fall", n: 7, shape: "dot" },
    void: { col: ["#2a0c48", "#5a1f8a", "#9a4ae0"], mode: "smoke", n: 9 },
    time: { col: ["#9fe8ff", "#ffffff"], mode: "orbit", n: 8, shape: "dot" },
    chaos: { col: ["#ff5ad0", "#5affd8", "#ffe85a", "#8a5aff"], mode: "orbit", n: 8, shape: "diamond" },
    leaf: { col: ["#9be36a", "#5fbf4a", "#ffd0e8"], mode: "fall", n: 8, shape: "leaf" },
    star: { col: ["#fff6c0", "#a8d8ff", "#ffffff"], mode: "orbit", n: 7, shape: "star" },
    spirit: { col: ["#a8fff0", "#7fd8ff", "#ffffff"], mode: "orbit", n: 4, shape: "wisp" },
    rage: { col: ["#ff3030", "#ff7a3a"], mode: "rise", n: 8, shape: "dot" },
    steam: { col: ["#e8e8f0", "#b8b8c8"], mode: "smoke", n: 6 },
    bubble: { col: ["#bff0ff", "#ffffff"], mode: "rise", n: 7, shape: "ring" },
    blood: { col: ["#c0102a", "#ff3050"], mode: "fall", n: 6, shape: "dot" }
  };
  const rnd = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
  function particle(c, shape, x, y, s, col, a) {
    if (a <= 0.02) return;
    c.globalAlpha = a;
    c.fillStyle = col;
    c.strokeStyle = col;
    switch (shape) {
      case "star":
        c.fillRect(x - s * 1.6, y - s * 0.3, s * 3.2, s * 0.6);
        c.fillRect(x - s * 0.3, y - s * 1.6, s * 0.6, s * 3.2);
        break;
      case "flake":
        c.lineWidth = Math.max(1, s * 0.4);
        c.beginPath();
        for (let k = 0; k < 3; k++) { const a2 = (k / 3) * Math.PI; c.moveTo(x - Math.cos(a2) * s * 1.4, y - Math.sin(a2) * s * 1.4); c.lineTo(x + Math.cos(a2) * s * 1.4, y + Math.sin(a2) * s * 1.4); }
        c.stroke();
        break;
      case "leaf":
        c.beginPath();
        c.ellipse(x, y, s * 1.5, s * 0.7, x * 0.05, 0, TAU);
        c.fill();
        break;
      case "diamond":
      case "rock":
        c.beginPath();
        c.moveTo(x, y - s * 1.4);
        c.lineTo(x + s, y);
        c.lineTo(x, y + s * (shape === "rock" ? 1 : 1.4));
        c.lineTo(x - s, y);
        c.closePath();
        c.fill();
        break;
      case "ring":
        c.lineWidth = Math.max(1, s * 0.35);
        c.beginPath();
        c.arc(x, y, s * 1.2, 0, TAU);
        c.stroke();
        break;
      case "wisp":
        c.globalAlpha = a * 0.35;
        c.beginPath();
        c.arc(x, y, s * 3, 0, TAU);
        c.fill();
        c.globalAlpha = a;
        c.beginPath();
        c.arc(x, y, s * 1.3, 0, TAU);
        c.fill();
        break;
      case "streak":
        c.lineWidth = Math.max(1, s * 0.5);
        c.beginPath();
        c.arc(x, y, s * 4, -0.4, 0.6);
        c.stroke();
        break;
      default:
        c.beginPath();
        c.arc(x, y, s, 0, TAU);
        c.fill();
    }
  }
  function aura(c, name, A, T, front) {
    const au = AURA[name];
    if (!au) return;
    const a0 = c.globalAlpha;
    const cx = A.bx;
    const W = A.W;
    const Hh = A.H;
    const s0 = Math.max(1.2, Hh * 0.014);
    c.save();
    if (!front) {
      /* 몸 뒤의 은은한 빛 */
      const g = c.createRadialGradient(cx, -Hh * 0.45, 0, cx, -Hh * 0.45, Hh * 0.55);
      g.addColorStop(0, au.col[0] + "55");
      g.addColorStop(1, au.col[0] + "00");
      c.fillStyle = g;
      c.fillRect(cx - Hh * 0.6, -Hh * 1.05, Hh * 1.2, Hh * 1.1);
    }
    for (let i = 0; i < au.n; i++) {
      const r1 = rnd(i, 1);
      const r2 = rnd(i, 2);
      const col = au.col[i % au.col.length];
      let x;
      let y;
      let a = 1;
      let s = s0 * (0.7 + r2 * 0.8);
      let isFront = i % 2 === 1;
      if (au.mode === "rise" || au.mode === "fall") {
        const ph = (T * (au.mode === "rise" ? 0.35 : 0.22) + i / au.n + r1 * 0.3) % 1;
        x = cx + (r1 - 0.5) * W * 0.95 + Math.sin(T * 1.7 + i * 1.3) * W * 0.05;
        y = au.mode === "rise" ? -ph * Hh * 1.05 : -Hh * 1.05 + ph * Hh * 1.05;
        a = Math.sin(ph * Math.PI);
      } else if (au.mode === "orbit" || au.mode === "swirl") {
        const sw = au.mode === "swirl";
        const ang = T * (sw ? 3 : 1.3) + (i / au.n) * TAU;
        const ph = sw ? (T * 0.3 + i / au.n) % 1 : 0;
        x = cx + Math.cos(ang) * W * (sw ? 0.3 + ph * 0.3 : 0.55);
        y = (sw ? -Hh * (0.1 + ph * 0.8) : -Hh * (0.42 + (r1 - 0.5) * 0.3)) + Math.sin(ang) * Hh * 0.07;
        isFront = Math.sin(ang) > 0;
        if (sw) a = Math.sin(ph * Math.PI);
      } else if (au.mode === "smoke") {
        const ph = (T * 0.22 + i / au.n) % 1;
        x = cx + (r1 - 0.5) * W * 0.8 + Math.sin(T + i) * W * 0.05;
        y = -Hh * 0.05 - ph * Hh * 0.95;
        s = Hh * (0.035 + ph * 0.05);
        a = 0.4 * Math.sin(ph * Math.PI);
        isFront = false;
      } else {
        const step = Math.floor(T * 5 + r1 * 7);
        if ((T * 5 + r1 * 7) % 1 > 0.35) continue;
        x = cx + (rnd(step, i) - 0.5) * W * 0.9;
        y = -Hh * (0.15 + rnd(step, i + 9) * 0.8);
        if (front) {
          c.globalAlpha = a0;
          c.strokeStyle = col;
          c.lineWidth = Math.max(1, Hh * 0.01);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + s * 3, y + s * 2);
          c.lineTo(x + s, y + s * 3);
          c.lineTo(x + s * 4, y + s * 6);
          c.stroke();
        }
        continue;
      }
      if (isFront !== front) continue;
      particle(c, au.shape || "dot", x, y, s, col, a0 * a);
    }
    c.restore();
  }

  /* 발밑(x, y)에 그린다. o: dir(1 오른쪽, -1 왼쪽), anim, t, f, h(키 px), alpha, tint, time(멈춘 시각) */
  function draw(ctx, job, x, y, o) {
    const lk = H.lookOf(job);
    const hh = o.h * lk.size;
    const cv = sprite(job, hh);
    if (!cv) return drawDoll(ctx, job, x, y, o);
    const T = o.time !== undefined ? o.time : clock();
    const m = motion(o.anim, o.t || 0, o.f || 0);
    if (lk.float) m.dy -= 0.03 + Math.sin(T * 2.4) * 0.015;
    const dir = o.dir || 1;
    const A = anchors(analyze(H.heroArtId(job)), cv);
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (lk.ghost ? 0.6 : 1);
    ctx.save();
    ctx.translate(Math.round(x + m.dx * hh * dir), Math.round(y + m.dy * hh));
    ctx.scale(dir * m.sx * lk.wide, m.sy);
    ctx.rotate(m.rot);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alpha;
    if (lk.aura) aura(ctx, lk.aura, A, T, false);
    if (lk.wings) wings(ctx, lk.wings, A, T);
    if (lk.clone === "twin") {
      const b = Math.sin(T * 2.6 + 1.5) * A.H * 0.012;
      ctx.drawImage(tinted(cv, "#1a1430", 0.3), -A.ax - A.W * 0.3, -A.H * 0.94 + b, A.W * 0.94, A.H * 0.94);
    } else if (lk.clone === "shadow") {
      ctx.globalAlpha = alpha * 0.45;
      ctx.drawImage(tinted(cv, "#140a24", 0.88), -A.ax - A.W * (0.22 + Math.sin(T * 1.6) * 0.05), -A.H);
      ctx.globalAlpha = alpha;
    }
    if (lk.rarity >= 3) {
      const gl = glow(cv, F.sprites.RARITY_COLOR[lk.rarity]);
      ctx.globalAlpha = alpha * (0.45 + 0.12 * (lk.rarity - 3) + Math.sin(T * 3) * 0.2);
      ctx.drawImage(gl, -A.ax - gl.pad, -A.H - gl.pad);
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(lk.ghost ? tinted(cv, "#a8dcff", 0.3) : cv, -A.ax, -A.H);
    if (lk.horns && (A.bare || lk.horns !== "tusk")) horns(ctx, lk.horns, A);
    if (lk.ears && (A.bare || lk.ears !== "elf")) ears(ctx, lk.ears, A);
    if (lk.crown) crown(ctx, A);
    if (lk.halo) halo(ctx, A, T);
    if (o.tint) {
      ctx.globalAlpha = alpha * (o.tintA || 0.5);
      ctx.drawImage(tinted(cv, o.tint, 1), -A.ax, -A.H);
      ctx.globalAlpha = alpha;
    }
    if (lk.aura) aura(ctx, lk.aura, A, T, true);
    ctx.restore();
    return { w: cv.width, h: cv.height, hand: [x + dir * cv.width * 0.36, y - cv.height * 0.45] };
  }

  /* 그림을 아직 못 읽었거나 없으면 예전 도트 인형으로 대신한다 */
  function drawDoll(ctx, job, x, y, o) {
    const k = Math.max(1, Math.round((o.h / 46) * 2) / 2);
    const dir = (o.dir || 1) > 0 ? "right" : "left";
    const anim = o.anim === "climb" ? "climb" : o.anim || "idle";
    const fr = F.doll.frame(job, anim === "climb" ? "up" : dir, anim, anim === "walk" ? Math.floor((o.t || 0) * 9) % 4 : o.f || 0, k);
    ctx.save();
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.drawImage(fr.cv, Math.round(x - fr.ax), Math.round(y - fr.ay));
    ctx.restore();
    return { w: fr.w, h: fr.h, hand: [x + (o.dir || 1) * fr.w * 0.3, y - fr.h * 0.4] };
  }

  /* 도감·결과 창 같은 DOM 그림: 직업별 겉모습을 입힌 작은 그림(data URL) */
  const thumbs = new Map();
  function url(job) {
    const id = H.heroArtId(job);
    if (thumbs.has(job.id)) return thumbs.get(job.id);
    if (!analyze(id) || !sprite(job, 10)) return src(id);
    const hh = 112;
    const cv = canvas(hh * 1.3, hh * 1.2);
    const lk = H.lookOf(job);
    draw(cv.getContext("2d"), job, cv.width * 0.56, cv.height - 2, { dir: 1, anim: "idle", t: 0, time: 0.6, h: hh / lk.size });
    const out = cv.toDataURL("image/png");
    if (thumbs.size > 600) thumbs.clear();
    thumbs.set(job.id, out);
    return out;
  }

  F.heroArt = { preload, sprite, draw, url, image, motion, analyze };
})(typeof window !== "undefined" ? window : globalThis);
