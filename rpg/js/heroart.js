/*
 * 삼천의 운명 — 주인공 그림과 동작
 * 미리 그린 캐릭터 그림(오른쪽을 봄)을 원하는 키로 줄여 두고, 다리를 번갈아 흔든 프레임 위에 몸을 기울이고
 * 늘이고 눌러 동작마다 뚜렷한 자세 프레임(대기·걷기·달리기·점프·낙하·착지·무기별 공격·시전·피격)을 만든다.
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
  function pixels(src, w, h) {
    const cv = canvas(w, h);
    const g = cv.getContext("2d");
    g.drawImage(src, 0, 0);
    try { return g.getImageData(0, 0, w, h).data; } catch (e) { return null; }
  }
  /* key: 그림 id 또는 "몸id+머리id"(머리를 바꿔 단 그림) */
  function analyze(key) {
    if (infos[key] !== undefined) return infos[key];
    const src = source(key);
    if (!src) return src;
    const w = src.width || src.naturalWidth;
    const h = src.height || src.naturalHeight;
    const data = pixels(src, w, h);
    infos[key] = data ? measure(data, w, h, src.face || faceAt(key)) : false;
    if (infos[key] && src.hairMask) src.hairMask.forEach((v, i) => { if (v) infos[key].kind[i] = 4; });
    return infos[key];
  }
  /* 직접 잰 얼굴 위치(heroes.HEAD_AT)를 얼굴 정보로 */
  function faceAt(id) {
    const at = H.HEAD_AT[id];
    return at ? { x: at[0], y: at[1] - at[2] * 0.42, w: at[2], top: at[1] - at[2] * 0.9, chin: at[1] } : null;
  }
  function measure(data, w, h, hint) {
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
    let face = hint || null;
    if (!face && fx.length > 30) {
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
        face = { x: pct(xs, 0.5), y: pct(ys, 0.5), w: fw, top: pct(ys, 0.06), chin: pct(ys, 0.96) };
      }
    }
    const bare = !!face;
    if (!face) face = { x: w * 0.5, y: h * 0.28, w: w * 0.24, top: h * 0.16, chin: h * 0.38 };
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
    return {
      w, h, kind, face, top, bare,
      dom: (((Math.atan2(vy, vx) / TAU) % 1) + 1) % 1,
      body: bodyN ? bodyX / bodyN : w * 0.46,
      hair: hc[3] ? hex(hc[0] / hc[3], hc[1] / hc[3], hc[2] / hc[3]) : "#4a3428",
      skin: sk[3] ? hex(sk[0] / sk[3], sk[1] / sk[3], sk[2] / sk[3]) : "#f4d0b8"
    };
  }

  /* ── 머리 바꿔 달기 ──
     머리 = 목선(턱 조금 아래) 위에서 얼굴과 이어진 덩어리. 무기 자루·지팡이처럼 가는 것은 한 번 깎아 낸 뒤
     얼굴과 이어진 부분만 다시 불려서 떼어 낸다. 몸 쪽 그림은 제 머리를 지우고 다른 그림의 머리를 턱에 맞춰 붙인다 */
  function boxPass(m, w, h, k, all, horizontal) {
    const out = new Uint8Array(w * h);
    const n = horizontal ? w : h;
    const lines = horizontal ? h : w;
    const ps = new Int32Array(n + 1);
    for (let l = 0; l < lines; l++) {
      const at = (j) => (horizontal ? l * w + j : j * w + l);
      for (let j = 0; j < n; j++) ps[j + 1] = ps[j] + m[at(j)];
      for (let j = 0; j < n; j++) {
        const a = Math.max(0, j - k);
        const b = Math.min(n, j + k + 1);
        const sum = ps[b] - ps[a];
        out[at(j)] = all ? (b - a === 2 * k + 1 && sum === b - a ? 1 : 0) : sum > 0 ? 1 : 0;
      }
    }
    return out;
  }
  const erode = (m, w, h, k) => boxPass(boxPass(m, w, h, k, true, true), w, h, k, true, false);
  const dilate = (m, w, h, k) => boxPass(boxPass(m, w, h, k, false, true), w, h, k, false, false);
  const heads = {};
  function headOf(id) {
    if (heads[id] !== undefined) return heads[id];
    const inf = analyze(id);
    if (!inf) return inf;
    const img = image(id);
    const { w, h } = inf;
    const data = H.HEAD_AT[id] ? pixels(img, w, h) : null;
    if (!data) return (heads[id] = false);
    const f = faceAt(id);
    if (!f) return (heads[id] = false);
    const fw = f.w;
    const chin = f.chin;
    const cut = Math.min(h - 1, Math.round(chin + fw * 0.1));
    const R = new Uint8Array(w * h);
    for (let y = 0; y <= cut; y++) {
      /* 모자 챙 높이는 넓게, 얼굴 높이는 머리카락까지, 턱 아래 띠에서는 목 둘레만(어깨는 빼고) */
      const lim = y > chin - fw * 0.1 ? fw * 0.55 : y < f.top - fw * 0.15 ? fw * 2.4 : fw * 1.8;
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 60 && Math.abs(x - f.x) <= lim) R[y * w + x] = 1;
    }
    const k = Math.max(2, Math.round(fw * 0.1));
    const E = erode(R, w, h, k);
    /* 얼굴 가운데에서 가장 가까운 남은 픽셀부터 채우기 */
    let seed = -1;
    for (let r = 0; r < fw && seed < 0; r++) {
      for (let y = Math.round(f.y) - r; y <= Math.round(f.y) + r && seed < 0; y++) {
        for (let x = Math.round(f.x) - r; x <= Math.round(f.x) + r; x++) {
          if (x >= 0 && y >= 0 && x < w && y < h && E[y * w + x]) { seed = y * w + x; break; }
        }
      }
    }
    if (seed < 0) return (heads[id] = false);
    const C = new Uint8Array(w * h);
    const stack = [seed];
    C[seed] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      [i - 1, i + 1, i - w, i + w].forEach((j) => {
        if (j < 0 || j >= w * h || C[j] || !E[j]) return;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) return;
        C[j] = 1;
        stack.push(j);
      });
    }
    const D = dilate(C, w, h, k);
    let x0 = w;
    let y0 = h;
    let x1 = 0;
    let y1 = 0;
    for (let i = 0; i < w * h; i++) {
      D[i] &= R[i];
      if (D[i]) { const x = i % w; const y = (i - x) / w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const cutCv = canvas(w, h);
    const ersCv = canvas(w, h);
    const g1 = cutCv.getContext("2d");
    const g2 = ersCv.getContext("2d");
    const a = g1.createImageData(w, h);
    const b = g2.createImageData(w, h);
    /* 몸 쪽에서 지울 곳: 머리, 그리고 머리 둘레에 남는 부스러기(머리카락 끝, 반투명 가장자리, 작은 조각) */
    const D2 = dilate(D, w, h, 1);
    const near = dilate(D, w, h, Math.max(3, k * 2));
    const seen = new Uint8Array(w * h);
    const small = Math.max(24, fw * fw * 0.12);
    for (let i = 0; i < w * h; i++) {
      if (seen[i] || !R[i] || D2[i]) continue;
      const comp = [i];
      seen[i] = 1;
      let touch = false;
      for (let q = 0; q < comp.length; q++) {
        const j = comp[q];
        if (near[j]) touch = true;
        const x = j % w;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            const n = j + oy * w + ox;
            if (nx < 0 || nx >= w || n < 0 || n >= w * h || seen[n] || !R[n] || D2[n]) continue;
            seen[n] = 1;
            comp.push(n);
          }
        }
      }
      if (touch && comp.length <= small) comp.forEach((j) => { D2[j] = 1; });
    }
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      for (let c = 0; c < 4; c++) { a.data[p + c] = data[p + c]; b.data[p + c] = data[p + c]; }
      if (!D[i]) a.data[p + 3] = 0;
      if (D2[i] || (near[i] && data[p + 3] <= 60)) b.data[p + 3] = 0;
    }
    g1.putImageData(a, 0, 0);
    g2.putImageData(b, 0, 0);
    /* 머리카락 색: 얼굴 양옆(모자·머릿수건을 써도 보이는 곳)의 평균 */
    const sc = [0, 0, 0, 0];
    for (let y = Math.round(f.y - fw * 0.25); y <= chin; y++) {
      for (let x = Math.round(f.x - fw * 0.85); x <= Math.round(f.x + fw * 0.85); x++) {
        if (x < 0 || y < 0 || x >= w || y >= h || Math.abs(x - f.x) < fw * 0.5) continue;
        const i = y * w + x;
        const p = i * 4;
        if (data[p + 3] > 150 && inf.kind[i] !== 1 && Math.max(data[p], data[p + 1], data[p + 2]) > 40) { sc[0] += data[p]; sc[1] += data[p + 1]; sc[2] += data[p + 2]; sc[3]++; }
      }
    }
    const side = [0, 0, 0];
    if (sc[3]) toHsv(sc[0] / sc[3], sc[1] / sc[3], sc[2] / sc[3], side);
    else { const hx = parseInt(inf.hair.slice(1), 16); toHsv(hx >> 16, (hx >> 8) & 255, hx & 255, side); }
    /* 머리를 지운 뒤에도 몸에 남는 긴 머리카락: 지운 자리 바로 바깥에서 머리카락 색과 같은 픽셀을 따라간다.
       새 머리를 달면 이 부분을 새 머리카락 색으로 칠한다(지우면 몸에 구멍이 난다) */
    const c = [0, 0, 0];
    const hairHsv = side;
    let long = null;
    if (hairHsv[1] > 0.15 && hairHsv[2] > 0.3) {
      const like = (i) => {
        const p = i * 4;
        if (data[p + 3] <= 60 || D2[i]) return false;
        toHsv(data[p], data[p + 1], data[p + 2], c);
        const dh = Math.abs(c[0] - hairHsv[0]);
        return Math.min(dh, 1 - dh) < 0.05 && Math.abs(c[1] - hairHsv[1]) < 0.3 && Math.abs(c[2] - hairHsv[2]) < 0.35;
      };
      long = new Uint8Array(w * h);
      const ring = dilate(D2, w, h, 3);
      const st = [];
      for (let i = 0; i < w * h; i++) if (ring[i] && like(i)) { long[i] = 1; st.push(i); }
      while (st.length) {
        const i = st.pop();
        const x = i % w;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const n = i + oy * w + ox;
            if (x + ox < 0 || x + ox >= w || n < 0 || n >= w * h || long[n] || !like(n)) continue;
            long[n] = 1;
            st.push(n);
          }
        }
      }
    }
    heads[id] = { cx: f.x, chin, cutY: cut, fw, x0, y0, x1, y1, cut: cutCv, erased: ersCv, w, h, face: f, long, hairHsv, side };
    return heads[id];
  }
  /* 몸 그림에 다른 그림의 머리를 단 새 그림. anchorX는 발밑 x(원래 그림의 0.46 지점) */
  const composed = {};
  function compose(bodyId, headId) {
    const key = bodyId + "+" + headId;
    if (composed[key] !== undefined) return composed[key];
    const bh = headOf(bodyId);
    const hh = headOf(headId);
    if (bh === null || hh === null) return null;
    if (!bh || !hh) return (composed[key] = image(bodyId));
    const s = Math.max(0.7, Math.min(1.45, bh.fw / hh.fw));
    const dx = bh.cx - hh.cx * s;
    const dy = bh.chin - hh.chin * s;
    const L = Math.floor(Math.min(0, dx + hh.x0 * s));
    const T = Math.floor(Math.min(0, dy + hh.y0 * s));
    const Rr = Math.ceil(Math.max(bh.w, dx + (hh.x1 + 1) * s));
    const W = Rr - L;
    const Hh = bh.h - T;
    /* 몸: 남은 긴 머리카락을 새 머리카락 색으로 */
    let body = bh.erased;
    if (bh.long) {
      body = canvas(bh.w, bh.h);
      const gb = body.getContext("2d");
      gb.drawImage(bh.erased, 0, 0);
      const im = gb.getImageData(0, 0, bh.w, bh.h);
      const c = [0, 0, 0];
      const vk = Math.max(0.35, Math.min(2.2, (hh.side[2] + 0.05) / (bh.hairHsv[2] + 0.05)));
      for (let i = 0; i < bh.w * bh.h; i++) {
        if (!bh.long[i]) continue;
        const p = i * 4;
        toHsv(im.data[p], im.data[p + 1], im.data[p + 2], c);
        toRgb(hh.side[0], Math.min(1, hh.side[1] * (0.5 + c[1])), Math.min(1, c[2] * vk), c);
        im.data[p] = c[0];
        im.data[p + 1] = c[1];
        im.data[p + 2] = c[2];
      }
      gb.putImageData(im, 0, 0);
    }
    const cv = canvas(W, Hh);
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(body, -L, -T);
    g.drawImage(hh.cut, dx - L, dy - T, hh.w * s, hh.h * s);
    cv.anchorX = bh.w * 0.46 - L;
    /* 칠한 긴 머리카락 자리를 기억해 두면, 직업별 머리카락 색을 입힐 때 같이 칠해진다 */
    if (bh.long) {
      const hl = canvas(W, Hh);
      const gh = hl.getContext("2d");
      gh.drawImage(hh.cut, dx - L, dy - T, hh.w * s, hh.h * s);
      const cover = gh.getImageData(0, 0, W, Hh).data;
      cv.hairMask = new Uint8Array(W * Hh);
      for (let i = 0; i < bh.w * bh.h; i++) {
        if (!bh.long[i]) continue;
        const x = (i % bh.w) - L;
        const y = Math.floor(i / bh.w) - T;
        const j = y * W + x;
        if (cover[j * 4 + 3] < 40) cv.hairMask[j] = 1;
      }
    }
    const hf = hh.face;
    cv.face = { x: dx + hf.x * s - L, y: dy + hf.y * s - T, w: hf.w * s, top: dy + hf.top * s - T, chin: dy + hf.chin * s - T };
    composed[key] = cv;
    return cv;
  }
  /* 분석·색칠의 바탕 그림: 그림 id면 원래 그림, "몸+머리"면 합친 그림. 아직 못 읽었으면 null */
  function source(key) {
    const plus = key.indexOf("+");
    if (plus < 0) { const img = image(key); return ready(img) ? img : null; }
    return compose(key.slice(0, plus), key.slice(plus + 1));
  }
  const srcKey = (job, lk) => H.heroArtId(job) + (lk.head ? "+" + lk.head : "");

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
  function bake(sk0, lk) {
    const key = sk0 + "#" + lookKey(lk);
    const hit = baked.get(key);
    if (hit) return hit;
    const img = source(sk0);
    const inf = analyze(sk0);
    if (!img || inf === null) return null;
    if (!inf || (!lk.pal && !lk.skin && !lk.hair)) { baked.set(key, img); return img; }
    const cv = canvas(inf.w, inf.h);
    cv.anchorX = img.anchorX;
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
    const lk = H.lookOf(job);
    const sk0 = srcKey(job, lk);
    const base = bake(sk0, lk);
    if (!base) return null;
    const bw = base.naturalWidth || base.width;
    const bh = base.naturalHeight || base.height;
    /* 머리를 바꿔 달아 그림이 위로 커졌으면, 몸의 키가 같아지도록 전체 키를 늘린다 */
    const body = image(H.heroArtId(job));
    const grow = lk.head && body.naturalHeight ? bh / body.naturalHeight : 1;
    const hpx = Math.max(8, Math.round(heightPx * grow));
    const key = `${sk0}#${lookKey(lk)}@${hpx}`;
    let cv = scaled.get(key);
    if (!cv) {
      cv = canvas((bw * hpx) / bh, hpx);
      cv.anchorX = ((base.anchorX === undefined ? bw * 0.46 : base.anchorX) * hpx) / bh;
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

  /* ── 다리 움직임 ──
     그림 한 장에서 두 다리를 찾아 엉덩이를 축으로 번갈아 흔든 프레임(걷기·달리기 8장, 점프·낙하·매달리기)을
     만든다. 발목 높이에서 떨어진 두 덩어리(두 발)를 찾고, 그 사이 틈을 따라 올라가 다리가 갈라지는 곳(가랑이·옷단)을
     찾는다. 긴 치마·로브처럼 다리가 안 보이는 그림은 옷단을 살짝 흔든다 */
  const WALK_RATE = 9.5;
  const RUN_RATE = 13.5;
  const legCache = new WeakMap();
  function legsOf(cv) {
    if (legCache.has(cv)) return legCache.get(cv);
    let res = null;
    try {
      const w = cv.width;
      const h = cv.height;
      const g0 = cv.getContext("2d");
      const im = g0.getImageData(0, 0, w, h);
      const d = im.data;
      const op = (x, y) => x >= 0 && x < w && y >= 0 && y < h && d[(y * w + x) * 4 + 3] > 90;
      const ax = cv.anchorX === undefined ? w * 0.46 : cv.anchorX;
      const xa = Math.max(0, Math.round(ax - w * 0.32));
      const xb = Math.min(w - 1, Math.round(ax + w * 0.32));
      let bottom = -1;
      for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = xa; x <= xb; x++) if (op(x, y)) { bottom = y; break; }
      if (bottom > h * 0.5) {
        const band = Math.round(bottom - h * 0.05);
        const runs = [];
        let cur = null;
        for (let x = xa; x <= xb; x++) {
          let on = false;
          for (let y = band; y <= bottom && !on; y++) on = op(x, y);
          if (on) { if (cur && x - cur.x1 <= 2) cur.x1 = x; else runs.push((cur = { x0: x, x1: x })); }
        }
        const feet = runs.filter((r) => r.x1 - r.x0 + 1 >= w * 0.035).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - ax) - Math.abs((b.x0 + b.x1) / 2 - ax)).slice(0, 2).sort((a, b) => a.x0 - b.x0);
        let fork = -1;
        const splitAt = new Int32Array(h).fill(-1);
        if (feet.length === 2 && feet[1].x0 - feet[0].x1 >= 1) {
          /* 두 발 사이 틈을 따라 위로: 틈이 막히는 곳이 다리가 갈라지는 곳 */
          let sx = Math.round((feet[0].x1 + feet[1].x0) / 2);
          for (let y = bottom; y > band; y--) splitAt[y] = sx;
          for (let y = band; y >= Math.round(bottom - h * 0.32); y--) {
            let best = -1;
            for (let k = 0; k <= 2 && best < 0; k++) { if (!op(sx + k, y)) best = sx + k; else if (!op(sx - k, y)) best = sx - k; }
            if (best < 0) { fork = y + 1; break; }
            sx = best;
            splitAt[y] = sx;
          }
        }
        if (fork > 0 && bottom - fork >= h * 0.06) {
          const pad = Math.round(w * 0.05);
          const x0 = Math.max(0, feet[0].x0 - pad);
          const x1 = Math.min(w - 1, feet[1].x1 + pad);
          const body = canvas(w, h);
          const legL = canvas(w, h);
          const legR = canvas(w, h);
          const ib = new ImageData(new Uint8ClampedArray(d), w, h);
          const il = new ImageData(w, h);
          const ir = new ImageData(w, h);
          for (let y = fork; y <= bottom; y++) {
            const sp = splitAt[y] < 0 ? Math.round((feet[0].x1 + feet[1].x0) / 2) : splitAt[y];
            for (let x = x0; x <= x1; x++) {
              const p = (y * w + x) * 4;
              const dst = x < sp ? il : ir;
              for (let c = 0; c < 4; c++) dst.data[p + c] = d[p + c];
              ib.data[p + 3] = 0;
            }
          }
          body.getContext("2d").putImageData(ib, 0, 0);
          legL.getContext("2d").putImageData(il, 0, 0);
          legR.getContext("2d").putImageData(ir, 0, 0);
          res = { kind: "legs", fork, bottom, body, legL, legR };
        } else res = { kind: "hem", top: Math.round(bottom - h * 0.2), bottom };
      }
    } catch (e) { res = null; }
    legCache.set(cv, res);
    return res;
  }
  /* 다리 하나를 갈라지는 곳(fork)을 축으로 기울이고(k: 발이 옮겨 가는 비율) 들어 올린다(lift: 무릎을 굽혀 줄어드는 비율) */
  function drawLeg(g, leg, fork, k, lift) {
    const sy = 1 - lift;
    g.setTransform(1, 0, k, sy, -k * fork, fork * (1 - sy));
    g.drawImage(leg, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  const frameCache = new WeakMap();
  function legFrame(cv, mode, i) {
    const L = legsOf(cv);
    if (!L) return cv;
    let m = frameCache.get(cv);
    if (!m) frameCache.set(cv, (m = new Map()));
    const key = mode + i;
    let out = m.get(key);
    if (out) return out;
    out = canvas(cv.width, cv.height);
    out.anchorX = cv.anchorX;
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = true;
    const ph = (i / 8) * TAU;
    if (L.kind === "legs") {
      let kL = 0;
      let kR = 0;
      let lL = 0;
      let lR = 0;
      const swing = mode === "run" ? 0.75 : 0.5;
      const up = mode === "run" ? 0.3 : 0.16;
      if (mode === "walk" || mode === "run") {
        kL = swing * Math.sin(ph);
        kR = -kL;
        lL = Math.max(0, Math.cos(ph)) * up;
        lR = Math.max(0, -Math.cos(ph)) * up;
      } else if (mode === "jump") { kL = 0.3; kR = -0.32; lL = 0.3; lR = 0.12; }
      else if (mode === "fall") { kL = -0.14; kR = 0.22; lL = 0.06; }
      else if (mode === "climb") { lL = i % 2 ? 0.32 : 0.04; lR = i % 2 ? 0.04 : 0.32; }
      g.drawImage(L.body, 0, 0);
      drawLeg(g, L.legL, L.fork, kL, lL);
      drawLeg(g, L.legR, L.fork, kR, lR);
    } else {
      /* 옷단 흔들기 */
      const k = (mode === "run" ? 0.14 : mode === "walk" ? 0.08 : mode === "jump" ? -0.1 : 0) * (mode === "jump" ? 1 : Math.sin(ph));
      g.drawImage(cv, 0, 0, cv.width, L.top, 0, 0, cv.width, L.top);
      g.setTransform(1, 0, k, 1, -k * L.top, 0);
      g.drawImage(cv, 0, L.top, cv.width, cv.height - L.top, 0, L.top, cv.width, cv.height - L.top);
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    m.set(key, out);
    return out;
  }
  /* ── 자세 프레임 ──
     참고 시트처럼 동작마다 뚜렷하게 다른 자세를 몇 장씩 만들어 끊어서 번갈아 보여 준다. 자세 한 장은
     다리 프레임(legFrame) 위에서 몸을 가로 띠로 나눠 띠마다 옮겨 그린 것이다:
     lean 위로 갈수록 앞으로 기울기, sq 발밑을 축으로 늘이기·누르기, trail 머리카락·망토가 뒤로 날리기, wave 물결 */
  const WALK_FPS = 10;
  const RUN_FPS = 14;
  function warp(src, p) {
    const W = src.width;
    const H = src.height;
    const padX = Math.ceil(H * 0.32);
    const padT = Math.ceil(H * 0.2);
    const out = canvas(W + padX * 2, H + padT);
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = true;
    const N = 20;
    const sq = p.sq || 1;
    for (let i = 0; i < N; i++) {
      const y0 = (i * H) / N;
      const hs = H / N;
      const u = 1 - (y0 + hs / 2) / H;
      const dx = (p.lean || 0) * H * u
        - (p.trail || 0) * H * Math.pow(Math.max(0, u - 0.35) / 0.65, 1.6)
        + (p.wave || 0) * H * Math.sin((p.phase || 0) + u * 6) * u;
      g.drawImage(src, 0, y0, W, hs + 0.6, padX + dx, padT + H - (H - y0) * sq, W, hs * sq + 0.8);
    }
    out.anchorX = (src.anchorX === undefined ? W * 0.46 : src.anchorX) + padX;
    return out;
  }
  /* 공격 자세 [준비, 내지르기, 마무리]. dx·dy는 키 비율, ghost는 잔상 */
  const LUNGE = ["run", 2];
  const ATTACK_POSE = {
    slash: [{ lean: -0.14, sq: 0.95, dx: -0.05, trail: -0.02 }, { lean: 0.2, sq: 0.97, sx: 1.1, dx: 0.12, trail: 0.08, ghost: 1, legs: LUNGE }, { lean: 0.08, dx: 0.06, trail: 0.03, legs: LUNGE }],
    thrust: [{ lean: -0.08, sx: 0.9, dx: -0.1 }, { lean: 0.12, sx: 1.16, dx: 0.22, trail: 0.1, ghost: 1, legs: LUNGE }, { lean: 0.05, dx: 0.1, legs: LUNGE }],
    smash: [{ lean: -0.18, sq: 1.14, sx: 0.9, dy: -0.06 }, { lean: 0.24, sq: 0.8, sx: 1.2, dx: 0.08, trail: 0.06, ghost: 1, legs: LUNGE }, { lean: 0.1, sq: 0.92, dx: 0.04, legs: LUNGE }],
    twin: [{ lean: -0.08, dx: -0.03 }, { lean: 0.18, sx: 1.08, dx: 0.1, trail: 0.06, ghost: 1, legs: LUNGE }, { lean: -0.06, sx: 1.06, dx: 0.08, ghost: 1, legs: LUNGE }],
    jab: [{ lean: -0.05, dx: -0.04 }, { lean: 0.14, sx: 1.08, dx: 0.14, ghost: 1, legs: LUNGE }, { lean: 0.04, dx: 0.05 }],
    lash: [{ lean: -0.16, dx: -0.06, dy: -0.02 }, { lean: 0.14, sx: 1.06, dx: 0.06, trail: 0.05, legs: LUNGE }, { lean: 0.04 }],
    sweep: [{ lean: -0.15, sq: 0.94, dx: -0.07 }, { lean: 0.22, sq: 0.92, sx: 1.12, dx: 0.05, trail: 0.08, ghost: 1, legs: LUNGE }, { lean: 0.1, dx: 0.02, legs: LUNGE }],
    stab: [{ lean: -0.08, sq: 0.95, dx: -0.06 }, { lean: 0.16, sx: 1.1, dx: 0.16, ghost: 1, legs: LUNGE }, { lean: 0.05, dx: 0.06 }],
    shoot: [{ lean: -0.04, dx: -0.02 }, { lean: -0.1, dx: -0.08, sx: 1.03 }, { lean: -0.03, dx: -0.03 }],
    cast: [{ lean: -0.1, sq: 1.05, dy: -0.03, trail: -0.03 }, { lean: 0.12, sx: 1.06, dx: 0.06, trail: 0.05 }],
    read: [{ lean: 0.06, sq: 0.97 }, { lean: 0.12, dx: 0.05 }],
    raise: [{ lean: -0.06, sq: 1.08, dy: -0.05, trail: -0.04 }, { lean: 0.02, sq: 1.05, dy: -0.03 }]
  };
  const LEGACY = { windup: ["slash", 0], strike: ["slash", 1], follow: ["slash", 2] };
  function poseOf(anim, t, f) {
    const P = { key: anim, legs: null, lean: 0, sq: 1, sx: 1, dx: 0, dy: 0, trail: 0, wave: 0, phase: 0, ghost: 0 };
    if (LEGACY[anim]) { f = LEGACY[anim][1]; anim = LEGACY[anim][0]; }
    if (ATTACK_POSE[anim]) {
      const list = ATTACK_POSE[anim];
      const k = Math.min(list.length - 1, f || 0);
      return Object.assign(P, list[k], { key: anim + k });
    }
    switch (anim) {
      case "walk": {
        const i = Math.floor(t * WALK_FPS) % 6;
        const ph = (i / 6) * TAU;
        return Object.assign(P, { key: "walk" + i, legs: ["walk", Math.round((i * 8) / 6) % 8], lean: 0.05, sq: 1 + 0.035 * Math.cos(2 * ph), dy: -0.045 * Math.abs(Math.cos(ph)), trail: 0.025 + 0.015 * Math.sin(ph), wave: 0.012, phase: ph });
      }
      case "run": {
        const i = Math.floor(t * RUN_FPS) % 6;
        const ph = (i / 6) * TAU;
        return Object.assign(P, { key: "run" + i, legs: ["run", Math.round((i * 8) / 6) % 8], lean: 0.17, sq: 1 + 0.05 * Math.cos(2 * ph), dy: -0.07 * Math.abs(Math.cos(ph)), trail: 0.08 + 0.025 * Math.sin(ph * 2), wave: 0.02, phase: ph });
      }
      case "jump": return Object.assign(P, { key: "jump", legs: ["jump", 0], sq: 1.1, sx: 0.92, lean: 0.06, trail: -0.03 });
      case "fall": return Object.assign(P, { key: "fall", legs: ["fall", 0], sq: 1.04, lean: -0.03, trail: -0.07 });
      case "land": return Object.assign(P, { key: "land", legs: ["jump", 0], sq: 0.8, sx: 1.16, lean: 0.04 });
      case "climb": { const i = Math.floor(t * 6) % 2; return Object.assign(P, { key: "climb" + i, legs: ["climb", i], dy: -0.02 * i }); }
      case "hurt": return Object.assign(P, { key: "hurt", lean: -0.16, dx: -0.06, sq: 0.95, trail: -0.04 });
      case "play": { const i = Math.floor(t * 8) % 4; return Object.assign(P, { key: "play" + i, lean: [0.06, 0, -0.06, 0][i], sq: [1, 1.03, 1, 0.98][i], dy: -0.02 * (i % 2) }); }
      case "victory": { const i = Math.floor(t * 6) % 2; return Object.assign(P, { key: "victory" + i, sq: i ? 1.06 : 0.96, dy: i ? -0.05 : 0 }); }
      default: {
        /* 대기: 숨쉬기 네 장 */
        const i = Math.floor(t * 3) % 4;
        return Object.assign(P, { key: "idle" + i, sq: [1, 1.015, 1.028, 1.015][i], lean: [0, 0.005, 0.01, 0.005][i], wave: 0.006, phase: (i * Math.PI) / 2 });
      }
    }
  }
  const poseCache = new WeakMap();
  function poseFrame(base, P) {
    let m = poseCache.get(base);
    if (!m) poseCache.set(base, (m = new Map()));
    let fr = m.get(P.key);
    if (!fr) {
      const src = P.legs ? legFrame(base, P.legs[0], P.legs[1]) : base;
      fr = warp(src, P);
      m.set(P.key, fr);
    }
    return fr;
  }

  /* ── 덧그림. 좌표는 그림의 발밑이 (0,0)인 로컬 좌표(오른쪽을 봄) ── */
  function anchors(inf, cv) {
    const ax = Math.round(cv.anchorX === undefined ? cv.width * 0.46 : cv.anchorX);
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
    const base = sprite(job, hh);
    if (!base) return drawDoll(ctx, job, x, y, o);
    const P = poseOf(o.anim, o.t || 0, o.f || 0);
    const fr = poseFrame(base, P);
    const T = o.time !== undefined ? o.time : clock();
    let dy = P.dy;
    if (lk.float) dy -= 0.03 + Math.sin(T * 2.4) * 0.015;
    const dir = o.dir || 1;
    const A = anchors(analyze(srcKey(job, lk)), base);
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (lk.ghost ? 0.6 : 1);
    const fx = -fr.anchorX;
    const fy = -fr.height;
    /* 덧그림(날개·기운·뿔…)도 몸과 같이 기울고 눌리게 */
    const bend = () => ctx.transform(1, 0, -P.lean, P.sq, 0, 0);
    ctx.save();
    ctx.translate(Math.round(x + P.dx * hh * dir), Math.round(y + dy * hh));
    ctx.scale(dir * P.sx * lk.wide, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alpha;
    ctx.save();
    bend();
    if (lk.aura) aura(ctx, lk.aura, A, T, false);
    if (lk.wings) wings(ctx, lk.wings, A, T);
    if (lk.rarity >= 3) {
      const gl = glow(base, F.sprites.RARITY_COLOR[lk.rarity]);
      ctx.globalAlpha = alpha * (0.45 + 0.12 * (lk.rarity - 3) + Math.sin(T * 3) * 0.2);
      ctx.drawImage(gl, -A.ax - gl.pad, -A.H - gl.pad);
      ctx.globalAlpha = alpha;
    }
    ctx.restore();
    if (lk.clone === "twin") {
      const b = Math.sin(T * 2.6 + 1.5) * A.H * 0.012;
      ctx.drawImage(tinted(fr, "#1a1430", 0.3), fx - A.W * 0.3, fy * 0.94 + b, fr.width * 0.94, fr.height * 0.94);
    } else if (lk.clone === "shadow") {
      ctx.globalAlpha = alpha * 0.45;
      ctx.drawImage(tinted(fr, "#140a24", 0.88), fx - A.W * (0.22 + Math.sin(T * 1.6) * 0.05), fy);
      ctx.globalAlpha = alpha;
    }
    /* 잔상: 달리기와 공격이 맞는 순간 */
    if (P.ghost) {
      const gh = tinted(fr, "#c8d4ff", 0.55);
      [[0.3, 0.14], [0.15, 0.28]].forEach(([a, off]) => {
        ctx.globalAlpha = alpha * a;
        ctx.drawImage(gh, fx - off * hh, fy);
      });
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(lk.ghost ? tinted(fr, "#a8dcff", 0.3) : fr, fx, fy);
    if (o.tint) {
      ctx.globalAlpha = alpha * (o.tintA || 0.5);
      ctx.drawImage(tinted(fr, o.tint, 1), fx, fy);
      ctx.globalAlpha = alpha;
    }
    bend();
    if (lk.horns && (A.bare || lk.horns !== "tusk")) horns(ctx, lk.horns, A);
    if (lk.ears && (A.bare || lk.ears !== "elf")) ears(ctx, lk.ears, A);
    if (lk.crown) crown(ctx, A);
    if (lk.halo) halo(ctx, A, T);
    if (lk.aura) aura(ctx, lk.aura, A, T, true);
    ctx.restore();
    return { w: base.width, h: base.height, hand: [x + dir * base.width * 0.36, y - base.height * 0.45] };
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
    if (!analyze(srcKey(job, H.lookOf(job))) || !sprite(job, 10)) return src(id);
    const hh = 112;
    const cv = canvas(hh * 1.3, hh * 1.2);
    const lk = H.lookOf(job);
    draw(cv.getContext("2d"), job, cv.width * 0.56, cv.height - 2, { dir: 1, anim: "idle", t: 0, time: 0.6, h: hh / lk.size });
    const out = cv.toDataURL("image/png");
    if (thumbs.size > 600) thumbs.clear();
    thumbs.set(job.id, out);
    return out;
  }

  F.heroArt = { preload, sprite, draw, url, image, analyze, headOf, compose };
})(typeof window !== "undefined" ? window : globalThis);
