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
    SHEET.forEach((n) => fxImage("wiz_" + n));
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
  /* 목 가운데 x: 턱 바로 아래 줄마다 목 폭만 한 살색 토막을 따라 내려간다. 옷깃·복면·머리카락에 가려 못 찾으면 얼굴 가운데 */
  function neckX(inf, f) {
    const w = inf.w;
    let px = f.x;
    let sum = 0;
    let n = 0;
    for (let y = Math.round(f.chin + f.w * 0.04); y <= Math.round(f.chin + f.w * 0.3) && y < inf.h; y++) {
      let best = null;
      for (let x = Math.max(0, Math.round(f.x - f.w * 0.9)); x <= Math.min(w - 1, Math.round(f.x + f.w * 0.9)); ) {
        if (inf.kind[y * w + x] !== 1) { x++; continue; }
        let e = x;
        while (e < w && inf.kind[y * w + e] === 1) e++;
        const m = (x + e - 1) / 2;
        if (e - x >= f.w * 0.12 && e - x <= f.w * 0.75 && (best === null || Math.abs(m - px) < Math.abs(best - px))) best = m;
        x = e;
      }
      if (best !== null && Math.abs(best - px) < f.w * 0.35) { sum += best; n++; px = best; }
    }
    return n >= 2 ? Math.max(f.x - f.w * 0.4, Math.min(f.x + f.w * 0.4, sum / n)) : f.x;
  }
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
    /* 손에 든 무기(heroes.WEAPON_AT에 잰 자리)와 머리에 붙은 몸의 일부(heroes.HEAD_SKIP: 꼬리 등) */
    const caps = [];
    (H.WEAPON_AT[id] || []).forEach((wp) => wp.slice(2).forEach((c) => caps.push(c)));
    (H.HEAD_SKIP[id] || []).forEach((c) => caps.push(c));
    for (let y = 0; y <= cut; y++) {
      /* 모자 챙 높이는 넓게, 얼굴 높이는 머리카락까지, 턱 아래 띠에서는 목 둘레만(어깨는 빼고, 아래로 갈수록 좁게) */
      const lim = y > chin - fw * 0.1 ? fw * (0.5 - 0.6 * (y - chin + fw * 0.1) / fw) : y < f.top - fw * 0.15 ? fw * 2.4 : fw * 1.8;
      for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 60 && Math.abs(x - f.x) <= lim && !caps.some((c) => capsuleHit(x, y, [c[0], c[1], c[2] + 2, c[3], c[4], c[5] + 2]))) R[y * w + x] = 1;
    }
    /* 깎아 내지 않고 얼굴과 이어진 픽셀을 다 가져간다(깎으면 삐친 머리카락·머리끝·뿔·리본이 떨어져 나간다).
       얼굴에 닿은 무기는 위에서 잰 자리로 미리 뺐다 */
    const k = Math.max(2, Math.round(fw * 0.1));
    const E = R;
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
    /* 가늘고 길게 곧은 조각(지팡이·총신·지휘봉 끝)은 뺀다: 깎아 내도 남는 두꺼운 부분 말고, 가는 부분 덩어리마다
       길이가 얼굴 폭의 0.6배 넘고 거의 일직선이면 무기. 짧거나 굽은 것(삐친 머리카락, 머리끝, 리본)은 그대로 */
    const O = dilate(erode(C, w, h, 2), w, h, 2);
    const thin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) if (C[i] && !O[i]) thin[i] = 1;
    const seenT = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      if (!thin[i] || seenT[i]) continue;
      const comp = [i];
      seenT[i] = 1;
      for (let q = 0; q < comp.length; q++) {
        const j = comp[q];
        const x = j % w;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const n = j + oy * w + ox;
            if (x + ox < 0 || x + ox >= w || n < 0 || n >= w * h || seenT[n] || !thin[n]) continue;
            seenT[n] = 1;
            comp.push(n);
          }
        }
      }
      if (comp.length < fw * 0.6) continue;
      let mx = 0;
      let my = 0;
      comp.forEach((j) => { mx += j % w; my += Math.floor(j / w); });
      mx /= comp.length;
      my /= comp.length;
      let sxx = 0;
      let syy = 0;
      let sxy = 0;
      comp.forEach((j) => { const ddx = (j % w) - mx; const ddy = Math.floor(j / w) - my; sxx += ddx * ddx; syy += ddy * ddy; sxy += ddx * ddy; });
      const tr = (sxx + syy) / comp.length;
      const det = (sxx * syy - sxy * sxy) / comp.length / comp.length;
      const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
      const l2 = Math.max(0, tr - l1);
      if (Math.sqrt(l1) * 3.4 >= fw * 0.6 && Math.sqrt(l2) <= Math.sqrt(l1) * 0.12) comp.forEach((j) => { C[j] = 0; });
    }
    const D = dilate(C, w, h, 1);
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
    /* 붙일 머리 조각: 머리 덩어리에 둘러싸인 빈틈과 가장자리의 옅은 픽셀까지(안 그러면 머리카락 사이가 뚫려 보인다) */
    const Dh = dilate(D, w, h, 1);
    const outside = new Uint8Array(w * h);
    const st0 = [];
    for (let x = 0; x < w; x++) [x, (h - 1) * w + x].forEach((i) => { if (!D[i] && !outside[i]) { outside[i] = 1; st0.push(i); } });
    for (let y = 0; y < h; y++) [y * w, y * w + w - 1].forEach((i) => { if (!D[i] && !outside[i]) { outside[i] = 1; st0.push(i); } });
    while (st0.length) {
      const i = st0.pop();
      const x = i % w;
      [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].forEach((n) => { if (n >= 0 && n < w * h && !D[n] && !outside[n]) { outside[n] = 1; st0.push(n); } });
    }
    for (let i = 0; i < w * h; i++) {
      if (!outside[i]) Dh[i] = 1;
      else if (Dh[i] && !D[i] && data[i * 4 + 3] > 60) Dh[i] = 0;
    }
    /* 턱 아래는 목 살갗만 가져간다(옷깃·늘어진 머리채는 몸 쪽 것을 쓴다) */
    const nx = neckX(inf, f);
    const chinY = Math.round(chin);
    for (let y = chinY + 1; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (Dh[i] && (Math.abs(x - nx) > fw * 0.45 || (inf.kind[i] !== 1 && y > chinY + 1))) Dh[i] = 0;
      }
    }
    /* 그래서 잘린 머리카락·수염·두건 끝은 톱니처럼 뾰족하게 다듬고 끝을 어둡게 한다(곧게 자른 선이 안 보이게) */
    const tipD = Math.max(2, Math.round(fw * 0.13));
    const tipP = Math.max(3, Math.round(fw * 0.13));
    const tips = [];
    for (let x = 0; x < w; x++) {
      let y = Math.min(h - 1, chinY + 1);
      while (y > 0 && !Dh[y * w + x]) y--;
      if (y < chin - fw * 0.6 || !Dh[y * w + x] || inf.kind[y * w + x] === 1) continue;
      if (y + 1 >= h || data[((y + 1) * w + x) * 4 + 3] <= 60) continue;
      const t = Math.round(tipD * Math.abs(((x % tipP) / tipP) * 2 - 1));
      let k = 0;
      while (k < t && y - k > 0 && Dh[(y - k) * w + x] && inf.kind[(y - k) * w + x] !== 1) { Dh[(y - k) * w + x] = 0; k++; }
      if (Dh[(y - k) * w + x]) tips.push((y - k) * w + x);
    }
    /* 한 픽셀 폭으로 남은 톱니 끝은 떼어 낸다(허공에 점선처럼 보인다) */
    for (let pass = 0; pass < 2; pass++) {
      for (let y = Math.max(0, chinY - tipD - 1); y <= Math.min(h - 1, chinY + 1); y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!Dh[i] || inf.kind[i] === 1) continue;
          if ((x > 0 && Dh[i - 1]) || (x < w - 1 && Dh[i + 1])) continue;
          Dh[i] = 0;
        }
      }
    }
    for (let k = tips.length - 1; k >= 0; k--) {
      let i = tips[k];
      while (i < w * h && !Dh[i] && i - w >= 0) i -= w;
      if (Dh[i]) tips[k] = i;
      else tips.splice(k, 1);
    }
    /* 톱니로 다듬다 끊겨 떨어진 부스러기(가는 끈·총신 끝이 점점이 남은 것)는 버린다: 얼굴과 이어진 덩어리만 */
    {
      const keepH = new Uint8Array(w * h);
      const s0 = Math.round(f.y) * w + Math.round(f.x);
      const st = [];
      if (Dh[s0]) { keepH[s0] = 1; st.push(s0); }
      while (st.length) {
        const i = st.pop();
        const x = i % w;
        [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w].forEach((n) => { if (n >= 0 && n < w * h && Dh[n] && !keepH[n]) { keepH[n] = 1; st.push(n); } });
      }
      if (st.length === 0 && Dh[s0]) for (let i = 0; i < w * h; i++) if (!keepH[i] && Dh[i] && i >= (chinY - Math.round(fw * 0.6)) * w) Dh[i] = 0;
    }
    /* gone: 몸 쪽에서 지운 자리(새 머리를 단 뒤 구멍이 남으면 메울 곳).
       under: 그 가운데 턱 아래(목·옷깃)와, 눈높이 아래에서 얼굴 둘레 밖에 있으면서 위쪽 머리(모자 챙)보다 몸에 더 붙은 조각
       (어깨에 걸친 망토·목도리·부채·꼬리·화살통)은 새 머리 밑에 다시 깐다 */
    const gone = new Uint8Array(w * h);
    const back = new Uint8Array(w * h);
    const eyeRow = Math.ceil(f.y) * w;
    for (let i = 0; i < w * h; i++) {
      if (!D2[i] || data[i * 4 + 3] <= 60) continue;
      const ux = (i % w - f.x) / fw;
      const uy = (Math.floor(i / w) - f.y) / fw;
      if (uy * fw > chin - f.y) back[i] = 2;
      else if (uy > 0 && ux * ux + (uy / 0.75) ** 2 > 1) back[i] = 1;
    }
    for (let i = 0; i < w * h; i++) {
      if (back[i] !== 1) continue;
      const comp = [i];
      back[i] = 3;
      let toBody = 0;
      let toHead = 0;
      for (let q = 0; q < comp.length; q++) {
        const j = comp[q];
        const x = j % w;
        [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j - w, j + w].forEach((n) => {
          if (n < 0 || n >= w * h || data[n * 4 + 3] <= 60) return;
          if (back[n] === 1) { back[n] = 3; comp.push(n); } else if (!D2[n] || back[n] === 2) toBody++;
          else if (!back[n] && n < eyeRow) toHead++;
        });
      }
      const v = toBody > toHead ? 2 : 4;
      comp.forEach((j) => { back[j] = v; });
    }
    const underCv = canvas(w, h);
    const g3 = underCv.getContext("2d");
    const u = g3.createImageData(w, h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      for (let c = 0; c < 4; c++) { a.data[p + c] = data[p + c]; b.data[p + c] = data[p + c]; }
      if (!Dh[i]) a.data[p + 3] = 0;
      if (D2[i] || (near[i] && data[p + 3] <= 60)) {
        if (data[p + 3] > 60) gone[i] = 1;
        b.data[p + 3] = 0;
        if (back[i] === 2) for (let c = 0; c < 4; c++) u.data[p + c] = data[p + c];
      }
    }
    /* 지우고 나서 몸통과 떨어져 떠 있는 조각(모자 챙 끝, 머리 장식, 잘린 지팡이 끝)은 턱보다 위에 있고 지운 자리에 닿으면 마저 지운다 */
    const keep = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) keep[i] = (b.data[p + 3] > 60 || u.data[p + 3] > 60) ? 1 : 0;
    const lab = new Int32Array(w * h).fill(-1);
    const comps = [];
    for (let i = 0; i < w * h; i++) {
      if (!keep[i] || lab[i] >= 0) continue;
      const comp = [i];
      lab[i] = comps.length;
      let sy = 0;
      let touch = false;
      for (let q = 0; q < comp.length; q++) {
        const j = comp[q];
        const x = j % w;
        sy += (j - x) / w;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const n = j + oy * w + ox;
            if (x + ox < 0 || x + ox >= w || n < 0 || n >= w * h) continue;
            if (D2[n] && !keep[n]) touch = true;
            if (!keep[n] || lab[n] >= 0) continue;
            lab[n] = comps.length;
            comp.push(n);
          }
        }
      }
      comps.push({ px: comp, cy: sy / comp.length, touch });
    }
    const main = comps.reduce((m, c) => (!m || c.px.length > m.px.length ? c : m), null);
    comps.forEach((c) => {
      if (c === main || !c.touch || c.cy >= chin) return;
      c.px.forEach((j) => { b.data[j * 4 + 3] = 0; u.data[j * 4 + 3] = 0; });
    });
    plug(a.data, w, h, erode(dilate(Dh, w, h, 1), w, h, 1));
    tips.forEach((i) => { for (let c = 0; c < 3; c++) a.data[i * 4 + c] = Math.round(a.data[i * 4 + c] * 0.5); });
    g1.putImageData(a, 0, 0);
    g2.putImageData(b, 0, 0);
    g3.putImageData(u, 0, 0);
    /* 머리를 떼어 낼 때 자른 가장자리 바로 바깥(그림이 이어지던 곳) */
    const edge = [];
    for (let i = 0; i < w * h; i++) {
      if (!Dh[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
        const X = x + ox;
        const Y = y + oy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && !Dh[Y * w + X] && data[(Y * w + X) * 4 + 3] > 60) edge.push(X, Y);
      });
    }
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3];
    heads[id] = { cx: f.x, chin, cutY: cut, fw, x0, y0, x1, y1, cut: cutCv, erased: ersCv, under: underCv, w, h, face: f, mask: D, gone, neck: nx, edge, alpha };
    return heads[id];
  }
  /* 새 머리가 지운 자리를 다 덮지 못해 목·옷깃 둘레에 생긴 구멍을 둘레 색으로 메운다.
     메우는 곳: 지운 자리 가운데 둘러싸여 바깥과 이어지지 않은 빈칸, 또는 좁은 틈(닫기 연산으로 막히는 곳) */
  function fillGaps(cv, bh, L, T) {
    const W = cv.width;
    const Hh = cv.height;
    const g = cv.getContext("2d");
    const im = g.getImageData(0, 0, W, Hh);
    const d = im.data;
    const n = W * Hh;
    const O = new Uint8Array(n);
    for (let i = 0; i < n; i++) O[i] = d[i * 4 + 3] >= 100 ? 1 : 0;
    const cand = new Uint8Array(n);
    let any = false;
    /* 목·옷깃 높이만(얼굴 옆 빈틈을 한 가지 색으로 메우면 납작한 네모가 된다) */
    for (let y = Math.max(0, Math.floor(bh.chin - bh.fw * 0.3)); y < bh.h; y++) {
      for (let x = 0; x < bh.w; x++) {
        if (!bh.gone[y * bh.w + x]) continue;
        const j = (y - T) * W + (x - L);
        if (!O[j]) { cand[j] = 1; any = true; }
      }
    }
    if (!any) return;
    const r = Math.max(2, Math.round(bh.fw * 0.12));
    const closed = erode(dilate(O, W, Hh, r), W, Hh, r);
    /* 바깥에서 빈칸을 따라 들어갈 수 있는 곳 */
    const out = new Uint8Array(n);
    const st = [];
    for (let x = 0; x < W; x++) [x, (Hh - 1) * W + x].forEach((i) => { if (!O[i] && !out[i]) { out[i] = 1; st.push(i); } });
    for (let y = 0; y < Hh; y++) [y * W, y * W + W - 1].forEach((i) => { if (!O[i] && !out[i]) { out[i] = 1; st.push(i); } });
    while (st.length) {
      const i = st.pop();
      const x = i % W;
      if (x > 0 && !O[i - 1] && !out[i - 1]) { out[i - 1] = 1; st.push(i - 1); }
      if (x < W - 1 && !O[i + 1] && !out[i + 1]) { out[i + 1] = 1; st.push(i + 1); }
      if (i >= W && !O[i - W] && !out[i - W]) { out[i - W] = 1; st.push(i - W); }
      if (i + W < n && !O[i + W] && !out[i + W]) { out[i + W] = 1; st.push(i + W); }
    }
    let todo = [];
    for (let i = 0; i < n; i++) if (cand[i] && (closed[i] || !out[i])) todo.push(i);
    if (!todo.length) return;
    /* 둘레에서 안쪽으로 한 겹씩: 이미 칠한 이웃 색의 평균 */
    for (let pass = 0; pass < 80 && todo.length; pass++) {
      const next = [];
      const put = [];
      todo.forEach((i) => {
        const x = i % W;
        let rr = 0;
        let gg = 0;
        let bb = 0;
        let k = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const j = i + oy * W + ox;
            if ((!ox && !oy) || x + ox < 0 || x + ox >= W || j < 0 || j >= n || !O[j]) continue;
            rr += d[j * 4];
            gg += d[j * 4 + 1];
            bb += d[j * 4 + 2];
            k++;
          }
        }
        if (k >= 2) put.push([i, rr / k, gg / k, bb / k]);
        else next.push(i);
      });
      if (!put.length) break;
      put.forEach(([i, rr, gg, bb]) => {
        d[i * 4] = rr;
        d[i * 4 + 1] = gg;
        d[i * 4 + 2] = bb;
        d[i * 4 + 3] = 255;
        O[i] = 1;
      });
      todo = next;
    }
    g.putImageData(im, 0, 0);
  }
  /* 잘린 자리가 그대로 드러난 길이(얼굴 폭 단위): 몸에서 지웠는데 새 머리가 덮지 못해 빈 곳에 맞닿은 몸 픽셀,
     그리고 새 머리를 떼어 낼 때 자른 가장자리가 빈 곳에 닿은 곳 */
  function seamOf(cv, bh, hh, L, T, dx, dy, s, hd, hk, drape) {
    const W = cv.width;
    const Hh = cv.height;
    const N = W * Hh;
    const d = cv.getContext("2d").getImageData(0, 0, W, Hh).data;
    const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= Hh ? 0 : d[(y * W + x) * 4 + 3]);
    const isHead = (x, y) => x >= 0 && y >= 0 && x < W && y < Hh && hd[(y * W + x) * 4 + 3] >= 40;
    const parts = [0, 0, 0, 0];
    const goneC = new Uint8Array(N);
    /* 자른 자리 후보 점(종류별). 그림 원래 가장자리는 들쭉날쭉하고, 칼로 자른 자리는 곧게 이어진다: 곧게 4칸 넘게 이어진 점만 센다 */
    const marks = [new Uint8Array(N), new Uint8Array(N), new Uint8Array(N)];
    const mark = (k, x, y) => { if (x >= 0 && y >= 0 && x < W && y < Hh) marks[k][y * W + x] = 1; };
    /* 1. 몸에서 지웠는데 비어 있는 곳에 맞닿은 몸 픽셀(곧게 잘린 베일·부채·머리채) */
    for (let y = 0; y < bh.h; y++) {
      for (let x = 0; x < bh.w; x++) {
        if (!bh.gone[y * bh.w + x]) continue;
        const X = x - L;
        const Y = y - T;
        goneC[Y * W + X] = 1;
        if (A(X, Y) >= 40) continue;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ox, oy]) => {
          if (A(X + ox, Y + oy) > 150 && !isHead(X + ox, Y + oy)) mark(0, X + ox, Y + oy);
        });
      }
    }
    for (let k = 0; k < hh.edge.length; k += 2) {
      const X = Math.round(hh.edge[k] * s + dx - L);
      const Y = Math.round(hh.edge[k + 1] * s + dy - T);
      /* 2. 새 머리를 떼어 낸 자리가 빈 곳에 닿음 */
      if (A(X, Y) < 40) { mark(1, X, Y); continue; }
      if (isHead(X, Y)) continue;
      /* 3. 새 머리의 잘린 가장자리(머리카락·옷깃)가 색이 다른 몸 위에서 끝남. 목 살갗끼리는 괜찮다 */
      const p = (Y * W + X) * 4;
      for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const X2 = X + ox;
        const Y2 = Y + oy;
        if (!isHead(X2, Y2) || A(X2, Y2) < 150) continue;
        const hx = Math.round((X2 + L - dx) / s);
        const hy = Math.round((Y2 + T - dy) / s);
        if (hk && hk[hy * hh.w + hx] === 1) break;
        const q = (Y2 * W + X2) * 4;
        if (Math.abs(d[p] - d[q]) + Math.abs(d[p + 1] - d[q + 1]) + Math.abs(d[p + 2] - d[q + 2]) > 120) mark(2, X, Y);
        break;
      }
    }
    marks.forEach((m, k) => {
      for (let i = 0; i < N; i++) {
        if (!m[i]) continue;
        /* 두건·베일처럼 어깨까지 늘어지는 천은 허공에서 끝나면 모양과 상관없이 드러난다(머리카락 끝은 들쭉날쭉해도 괜찮다) */
        if (k === 1 && drape) { parts[k]++; continue; }
        const x = i % W;
        let a = 0;
        let b = 0;
        while (x - a - 1 >= 0 && m[i - a - 1]) a++;
        while (x + b + 1 < W && m[i + b + 1]) b++;
        let c = 0;
        let e = 0;
        while (i - (c + 1) * W >= 0 && m[i - (c + 1) * W]) c++;
        while (i + (e + 1) * W < N && m[i + (e + 1) * W]) e++;
        if (a + b + 1 >= 4 || c + e + 1 >= 4) parts[k]++;
      }
    });
    /* 4. 지운 자리 근처에 몸통과 떨어져 떠 있는 조각(옛 머리카락·모자 챙 부스러기) */
    const near = dilate(goneC, W, Hh, 2);
    const lab = new Int32Array(N).fill(-1);
    const comps = [];
    for (let i = 0; i < N; i++) {
      if (d[i * 4 + 3] <= 60 || lab[i] >= 0) continue;
      const comp = [i];
      lab[i] = comps.length;
      let touch = false;
      let edge = 0;
      for (let q = 0; q < comp.length; q++) {
        const j = comp[q];
        const x = j % W;
        if (near[j]) touch = true;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nn = j + oy * W + ox;
            if (x + ox < 0 || x + ox >= W || nn < 0 || nn >= N) continue;
            if (d[nn * 4 + 3] <= 60) { if (!ox || !oy) edge++; continue; }
            if (lab[nn] >= 0) continue;
            lab[nn] = comps.length;
            comp.push(nn);
          }
        }
      }
      comps.push({ n: comp.length, touch, edge });
    }
    const main = comps.reduce((m, c) => (!m || c.n > m.n ? c : m), null);
    comps.forEach((c) => { if (c !== main && c.touch) parts[3] += c.edge; });
    cv.seamParts = parts.map((v) => +(v / bh.fw).toFixed(2));
    return (parts[0] + parts[1] + parts[2] + parts[3]) / bh.fw;
  }
  /* 한두 픽셀짜리 틈(머리카락 가닥 사이 등)을 둘레 색으로 메운다: 크게 그리면 뒤 배경이 점점이 비친다.
     where가 있으면 그 안에서만, 없으면 둘레 8칸 가운데 5칸 넘게 차 있는 곳 */
  function plug(d, w, h, where) {
    for (let i = 0; i < w * h; i++) {
      if ((where && !where[i]) || d[i * 4 + 3] >= 128) continue;
      const x = i % w;
      let rr = 0;
      let gg = 0;
      let bb = 0;
      let n = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const j = i + oy * w + ox;
          if (x + ox < 0 || x + ox >= w || j < 0 || j >= w * h || d[j * 4 + 3] < 200) continue;
          rr += d[j * 4];
          gg += d[j * 4 + 1];
          bb += d[j * 4 + 2];
          n++;
        }
      }
      if (n >= 5) { d[i * 4] = rr / n; d[i * 4 + 1] = gg / n; d[i * 4 + 2] = bb / n; d[i * 4 + 3] = 255; }
    }
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
    /* 얼굴 크기가 비슷하면(머리 고르기에서 그렇게 고른다) 늘리지 않고 픽셀 그대로 붙인다: 늘리면 머리만 흐려진다.
       목 가운데끼리, 턱끼리 맞춘다(얼굴 가운데끼리 맞추면 비스듬한 얼굴에서 목이 어긋나 돌아간 듯 보인다) */
    const ratio = bh.fw / hh.fw;
    const s = ratio >= 0.86 && ratio <= 1.16 ? 1 : Math.max(0.75, Math.min(1.3, ratio));
    const dx = Math.round(bh.neck - hh.neck * s);
    const dy = Math.round(bh.chin - hh.chin * s);
    const L = Math.floor(Math.min(0, dx + hh.x0 * s));
    const T = Math.floor(Math.min(0, dy + hh.y0 * s));
    const Rr = Math.ceil(Math.max(bh.w, dx + (hh.x1 + 1) * s));
    const W = Rr - L;
    const Hh = bh.h - T;
    const cv = canvas(W, Hh);
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(bh.erased, -L, -T);
    g.imageSmoothingEnabled = s !== 1;
    g.drawImage(hh.cut, dx - L, dy - T, hh.w * s, hh.h * s);
    g.imageSmoothingEnabled = true;
    /* 새 머리에 딸려 온 턱 아래(옷깃·털 목도리·늘어진 머리채)가 몸 테두리 밖으로 나가면 잘라 낸다: 거기서 끊긴 자리가 그대로 드러난다.
       턱보다 위(투구 볼가리개, 옆머리)는 건드리지 않는다 */
    {
      const im = g.getImageData(0, 0, W, Hh);
      const y0 = Math.max(0, Math.ceil(bh.chin));
      for (let y = y0; y < bh.h; y++) {
        for (let x = 0; x < bh.w; x++) {
          if (Math.abs(x - bh.neck) < bh.fw * 0.45 || bh.alpha[y * bh.w + x] > 60) continue;
          im.data[((y - T) * W + (x - L)) * 4 + 3] = 0;
        }
      }
      g.putImageData(im, 0, 0);
    }
    g.globalCompositeOperation = "destination-over";
    g.drawImage(bh.under, -L, -T);
    g.globalCompositeOperation = "source-over";
    fillGaps(cv, bh, L, T);
    /* 새 머리 자리: 옷 색을 바꿀 때 머리는 원래 색 그대로 둔다(머리카락 픽셀마다 갈래가 달라 얼룩이 생긴다) */
    const hc = canvas(W, Hh);
    const hcg = hc.getContext("2d");
    hcg.imageSmoothingEnabled = s !== 1;
    hcg.drawImage(hh.cut, dx - L, dy - T, hh.w * s, hh.h * s);
    const hd = hcg.getImageData(0, 0, W, Hh).data;
    cv.headMask = new Uint8Array(W * Hh);
    for (let i = 0; i < W * Hh; i++) if (hd[i * 4 + 3] > 0) cv.headMask[i] = 1;
    const hinf = analyze(headId);
    cv.seam = seamOf(cv, bh, hh, L, T, dx, dy, s, hd, hinf && hinf.kind, H.DRAPE.includes(headId));
    cv.anchorX = bh.w * 0.46 - L;
    cv.place = { bodyId, headId, L, T, dx, dy, s };
    const hf = hh.face;
    cv.face = { x: dx + hf.x * s - L, y: dy + hf.y * s - T, w: hf.w * s, top: dy + hf.top * s - T, chin: dy + hf.chin * s - T };
    composed[key] = cv;
    return cv;
  }
  /* 참고 시트의 마법사 프레임(assets/fx/wiz_*.png) */
  const fxImgs = {};
  function fxImage(name) {
    let img = fxImgs[name];
    if (!img) {
      img = new Image();
      img.src = (F.FX_ART && F.FX_ART[name]) || `assets/fx/${name}.png`;
      fxImgs[name] = img;
    }
    return img;
  }
  /* 분석·색칠의 바탕 그림: 그림 id면 원래 그림, "몸+머리"면 합친 그림, "fx:이름"이면 시트 프레임. 아직 못 읽었으면 null */
  function source(key) {
    if (key.startsWith("fx:")) { const img = fxImage(key.slice(3)); return ready(img) ? img : null; }
    const plus = key.indexOf("+");
    if (plus < 0) { const img = image(key); return ready(img) ? img : null; }
    return compose(key.slice(0, plus), key.slice(plus + 1));
  }
  /* 머리 후보(heroes.lookOf의 heads) 가운데 붙여서 잘린 자리가 거의 안 드러나는 첫 머리. 다 드러나면 원래 머리 그대로 */
  const SEAM_OK = 0.2;
  const chosen = new Map();
  function headFor(job, lk) {
    if (!lk.heads) return null;
    const body = H.heroArtId(job);
    const key = body + ">" + lk.heads.join(",");
    if (chosen.has(key)) return chosen.get(key);
    for (const id of lk.heads) {
      const cv = compose(body, id);
      /* 그림을 아직 못 읽었으면 첫 후보로 두고 다음에 다시 고른다 */
      if (cv === null) return lk.heads[0];
      /* 머리 위치를 재 두지 않은 몸(cv.place 없음)은 머리를 바꿀 수 없다 */
      if (!cv.place) break;
      if (cv.seam <= SEAM_OK) { chosen.set(key, id); return id; }
    }
    chosen.set(key, null);
    return null;
  }
  const srcKey = (job, lk) => { const hd = headFor(job, lk); return H.heroArtId(job) + (hd ? "+" + hd : ""); };
  /* 짐승 머리(수인·용인·리자드맨)를 달았으면 그 수식어의 덧그림(귀·뿔)과 살빛은 머리 그림이 대신한다.
     못 달았으면(잘린 자리가 드러나서) 원래 머리에 덧그림과 살빛을 입힌다 */
  const beastKey = (sk0) => { const i = sk0.indexOf("+"); const hd = i >= 0 ? sk0.slice(i + 1) : ""; return H.HEAD_TAG[hd] === "b" || hd === "bl_fox"; };

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
    if (!inf) { baked.set(key, img); return img; }
    const cv = canvas(inf.w, inf.h);
    cv.anchorX = img.anchorX;
    const g = cv.getContext("2d");
    g.drawImage(img, 0, 0);
    const im = g.getImageData(0, 0, inf.w, inf.h);
    const d = im.data;
    plug(d, inf.w, inf.h);
    const pal = lk.pal;
    const dh = pal ? pal.h / 360 - inf.dom : 0;
    const ps = pal ? pal.s || 1 : 1;
    const pv = pal ? pal.v || 1 : 1;
    const nv = 1 + (pv - 1) * 0.6;
    const sk = lk.skin && !beastKey(sk0) ? SKINS[lk.skin] : null;
    /* 다른 그림의 머리를 단 그림은 그 머리의 머리카락 색 그대로(얼굴 둘레를 다시 칠하면 베일·두건까지 물든다) */
    const hr = lk.hair && !sk0.includes("+") ? HAIRS[lk.hair] : null;
    const c = [0, 0, 0];
    for (let i = 0, n = inf.w * inf.h; i < n; i++) {
      const k = inf.kind[i];
      if (!k || (img.headMask && img.headMask[i] && k !== 1)) continue;
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
    const grow = sk0.includes("+") && body.naturalHeight ? bh / body.naturalHeight : 1;
    const hpx = Math.max(8, Math.round(heightPx * grow));
    const key = `${sk0}#${lookKey(lk)}@${hpx}`;
    let cv = scaled.get(key);
    if (!cv) {
      cv = canvas((bw * hpx) / bh, hpx);
      cv.anchorX = ((base.anchorX === undefined ? bw * 0.46 : base.anchorX) * hpx) / bh;
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      /* 크게 그릴 때는 먼저 정수 배로 픽셀 그대로 키우고 남은 만큼만 부드럽게: 통째로 부드럽게 늘리면 뭉개진다 */
      const k = Math.floor(hpx / bh);
      if (k >= 2) {
        const big = canvas(bw * k, bh * k);
        const gb = big.getContext("2d");
        gb.imageSmoothingEnabled = false;
        gb.drawImage(base, 0, 0, bw * k, bh * k);
        g.drawImage(big, 0, 0, cv.width, cv.height);
      } else g.drawImage(base, 0, 0, cv.width, cv.height);
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

  /* ── 부위로 나눠 움직이기(컷아웃 리그) ──
     그림 한 장을 머리·몸통·두 다리(허벅지와 정강이)·손에 든 물건으로 나눠, 프레임마다 부위를 따로 돌리고 옮겨
     걷기·달리기·점프·착지·공격 자세를 만든다. 머리 위치는 heroes.HEAD_AT, 물건은 heroes.WEAPON_AT(직접 잰 값),
     다리는 발밑의 두 발과 그 사이 틈으로 찾는다. 물건을 떼어 낸 자리가 몸 위였으면 둘레 색으로 메운다 */

  /* 원래 크기에서 한 번: 부위별 마스크와 축 */
  const rigMaskCache = {};
  function capsuleHit(x, y, c) {
    const [x1, y1, r1, x2, y2, r2] = c;
    const vx = x2 - x1;
    const vy = y2 - y1;
    const L2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / L2));
    const dx = x - (x1 + vx * t);
    const dy = y - (y1 + vy * t);
    const r = r1 + (r2 - r1) * t + 2;
    return dx * dx + dy * dy <= r * r;
  }
  function rigMasks(sk0) {
    if (rigMaskCache[sk0] !== undefined) return rigMaskCache[sk0];
    const src = source(sk0);
    if (!src) return null;
    const w = src.width || src.naturalWidth;
    const h = src.height || src.naturalHeight;
    const data = pixels(src, w, h);
    if (!data) return (rigMaskCache[sk0] = false);
    const plus = sk0.indexOf("+");
    const bodyId = plus < 0 ? sk0 : sk0.slice(0, plus);
    const pl = src.place || { L: 0, T: 0 };
    const N = w * h;
    const alpha = (i) => data[i * 4 + 3];
    /* 머리 */
    let head = null;
    let neck = null;
    if (plus < 0) {
      const hd = headOf(sk0);
      if (hd) { head = hd.mask; neck = [hd.cx, hd.chin]; }
    } else if (src.place) {
      const hh = headOf(pl.headId);
      const t = canvas(w, h);
      t.getContext("2d").drawImage(hh.cut, pl.dx - pl.L, pl.dy - pl.T, hh.w * pl.s, hh.h * pl.s);
      const hd = t.getContext("2d").getImageData(0, 0, w, h).data;
      head = new Uint8Array(N);
      for (let i = 0; i < N; i++) head[i] = hd[i * 4 + 3] > 40 ? 1 : 0;
      neck = [src.face.x, src.face.chin];
    }
    /* 손에 든 물건 */
    const weapons = [];
    const any = new Uint8Array(N);
    let maxR = 0;
    (H.WEAPON_AT[bodyId] || []).forEach((wp) => {
      const caps = wp.slice(2).map((c) => [c[0] - pl.L, c[1] - pl.T, c[2], c[3] - pl.L, c[4] - pl.T, c[5]]);
      const mask = new Uint8Array(N);
      let n = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (alpha(i) < 20 || (head && head[i]) || any[i]) continue;
          if (caps.some((c) => capsuleHit(x, y, c))) { mask[i] = 1; any[i] = 1; n++; }
        }
      }
      caps.forEach((c) => { maxR = Math.max(maxR, c[2], c[5]); });
      if (n > 12) weapons.push({ mask, grip: [wp[0] - pl.L, wp[1] - pl.T] });
    });
    /* 몸통(머리·물건을 뺀 나머지)과, 물건을 떼면 비는 몸 위 자리(fill) */
    const body = new Uint8Array(N);
    for (let i = 0; i < N; i++) body[i] = alpha(i) > 20 && !(head && head[i]) && !any[i] ? 1 : 0;
    const reach = Math.min(14, maxR + 3);
    const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
    /* 캡슐 밖으로 삐져나온 물건 가장자리(칼날 테두리·창끝)도 물건에 붙인다: 물건 가까이에 있으면서
       몸 안쪽(양쪽에 몸이 있는 곳)이 아닌 픽셀 */
    const between = (i, isBody) => {
      const x = i % w;
      const y = (i - x) / w;
      const hit = (dx, dy) => {
        for (let k = 1; k <= 6; k++) {
          const xx = x + dx * k;
          const yy = y + dy * k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
          const j = yy * w + xx;
          if (isBody[j]) return true;
          if (alpha(j) < 20) return false;
        }
        return false;
      };
      return DIRS.some(([dx, dy]) => hit(dx, dy) && hit(-dx, -dy));
    };
    for (let pass = 0; pass < 3; pass++) {
      const add = [];
      for (let i = 0; i < N; i++) {
        if (!body[i]) continue;
        const x = i % w;
        let owner = -1;
        for (let k = 0; k < weapons.length && owner < 0; k++) {
          const m = weapons[k].mask;
          if ((x > 0 && m[i - 1]) || (x < w - 1 && m[i + 1]) || m[i - w] || m[i + w]) owner = k;
        }
        if (owner >= 0 && !between(i, body)) add.push([i, owner]);
      }
      add.forEach(([i, k]) => { weapons[k].mask[i] = 1; any[i] = 1; body[i] = 0; });
    }
    /* 물건 옆에 떨어져 남은 작은 몸 조각(자루 끝·칼날 부스러기)은 물건으로 */
    if (weapons.length) {
      const seen = new Uint8Array(N);
      const small = Math.max(30, N * 0.004);
      for (let i = 0; i < N; i++) {
        if (!body[i] || seen[i]) continue;
        const comp = [i];
        seen[i] = 1;
        let owner = -1;
        for (let q = 0; q < comp.length; q++) {
          const j = comp[q];
          const x = j % w;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const n = j + oy * w + ox;
            if (x + ox < 0 || x + ox >= w || n < 0 || n >= N) continue;
            if (owner < 0) for (let k = 0; k < weapons.length; k++) if (weapons[k].mask[n]) owner = k;
            if (!body[n] || seen[n]) continue;
            seen[n] = 1;
            comp.push(n);
          }
        }
        if (owner >= 0 && comp.length <= small) comp.forEach((j) => { weapons[owner].mask[j] = 1; any[j] = 1; body[j] = 0; });
      }
    }
    const fillSet = new Uint8Array(N);
    const fillList = [];
    for (let i = 0; i < N; i++) {
      if (!any[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      const hit = (dx, dy) => {
        for (let k = 1; k <= reach; k++) {
          const xx = x + dx * k;
          const yy = y + dy * k;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) return false;
          const j = yy * w + xx;
          if (body[j]) return true;
          if (!any[j] && alpha(j) < 20) return false;
        }
        return false;
      };
      if (DIRS.some(([dx, dy]) => hit(dx, dy) && hit(-dx, -dy))) { fillSet[i] = 1; fillList.push(i); }
    }
    /* 메우는 순서: 몸에 가까운 칸부터, 이미 아는 이웃의 평균 */
    const known = body.slice();
    const order = [];
    let frontier = fillList.filter((i) => { const x = i % w; return (x > 0 && known[i - 1]) || (x < w - 1 && known[i + 1]) || known[i - w] || known[i + w]; });
    const queued = new Uint8Array(N);
    frontier.forEach((i) => { queued[i] = 1; });
    while (frontier.length) {
      const next = [];
      frontier.forEach((i) => {
        const x = i % w;
        const nb = [];
        for (const j of [i - 1, i + 1, i - w, i + w, i - w - 1, i - w + 1, i + w - 1, i + w + 1]) {
          if (j < 0 || j >= N || Math.abs((j % w) - x) > 1) continue;
          if (known[j]) nb.push(j);
        }
        order.push([i, nb]);
      });
      frontier.forEach((i) => { known[i] = 1; });
      frontier.forEach((i) => {
        const x = i % w;
        for (const j of [i - 1, i + 1, i - w, i + w]) {
          if (j < 0 || j >= N || Math.abs((j % w) - x) > 1 || !fillSet[j] || queued[j]) continue;
          queued[j] = 1;
          next.push(j);
        }
      });
      frontier = next;
    }
    /* 다리: 몸통(메운 뒤)의 발밑에서 두 발을 찾고, 틈을 따라 올라가 갈라지는 곳까지 */
    const solid = known;
    const ax = src.anchorX === undefined ? w * 0.46 : src.anchorX;
    const legs = legGeom(solid, w, h, ax);
    rigMaskCache[sk0] = { w, h, head, neck, weapons, order, legs, ax };
    return rigMaskCache[sk0];
  }
  function legGeom(S, w, h, ax) {
    const op = (x, y) => x >= 0 && x < w && y >= 0 && y < h && S[y * w + x];
    const xa = Math.max(0, Math.round(ax - w * 0.32));
    const xb = Math.min(w - 1, Math.round(ax + w * 0.32));
    let bottom = -1;
    for (let y = h - 1; y >= 0 && bottom < 0; y--) for (let x = xa; x <= xb; x++) if (op(x, y)) { bottom = y; break; }
    if (bottom < h * 0.5) return null;
    const band = Math.round(bottom - h * 0.05);
    const runs = [];
    let cur = null;
    for (let x = xa; x <= xb; x++) {
      let on = false;
      for (let y = band; y <= bottom && !on; y++) on = op(x, y);
      if (on) { if (cur && x - cur.x1 <= 2) cur.x1 = x; else runs.push((cur = { x0: x, x1: x })); }
    }
    const feet = runs.filter((r) => r.x1 - r.x0 + 1 >= w * 0.035).sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - ax) - Math.abs((b.x0 + b.x1) / 2 - ax)).slice(0, 2).sort((a, b) => a.x0 - b.x0);
    if (feet.length < 2 || feet[1].x0 - feet[0].x1 < 1) return { hem: Math.round(bottom - h * 0.2), bottom };
    const split = new Int32Array(h).fill(-1);
    let sx = Math.round((feet[0].x1 + feet[1].x0) / 2);
    for (let y = bottom; y > band; y--) split[y] = sx;
    let fork = -1;
    for (let y = band; y >= Math.round(bottom - h * 0.34); y--) {
      let best = -1;
      for (let k = 0; k <= 2 && best < 0; k++) { if (!op(sx + k, y)) best = sx + k; else if (!op(sx - k, y)) best = sx - k; }
      if (best < 0) { fork = y + 1; break; }
      sx = best;
      split[y] = sx;
    }
    if (fork < 0 || bottom - fork < h * 0.06) return { hem: Math.round(bottom - h * 0.2), bottom };
    /* 가랑이 위 몇 줄도 다리에 붙여(몸통에도 남긴다) 돌렸을 때 틈이 안 보이게 */
    const top = Math.max(0, fork - Math.round(h * 0.03));
    for (let y = top; y < fork; y++) split[y] = split[fork];
    const pad = Math.round(w * 0.05);
    const x0 = Math.max(0, feet[0].x0 - pad);
    const x1 = Math.min(w - 1, feet[1].x1 + pad);
    const hipX = [0, 0];
    const hipN = [0, 0];
    for (let y = fork; y < Math.min(bottom, fork + 4); y++) {
      for (let x = x0; x <= x1; x++) if (op(x, y)) { const k = x < split[y] ? 0 : 1; hipX[k] += x; hipN[k]++; }
    }
    return {
      fork, top, bottom, x0, x1, split,
      hips: [[hipN[0] ? hipX[0] / hipN[0] : feet[0].x1, fork], [hipN[1] ? hipX[1] / hipN[1] : feet[1].x0, fork]],
      knee: Math.round(fork + (bottom - fork) * 0.5)
    };
  }

  /* 색칠한 그림에서 부위 그림을 오려 화면 키로 줄인다 */
  const rigCache = new Map();
  function rigOf(job, heightPx) {
    const lk = H.lookOf(job);
    const sk0 = srcKey(job, lk);
    const base = bake(sk0, lk);
    const M = rigMasks(sk0);
    if (!base || !M) return M === false ? false : null;
    const body0 = image(H.heroArtId(job));
    const grow = sk0.includes("+") && body0.naturalHeight ? M.h / body0.naturalHeight : 1;
    const hpx = Math.max(8, Math.round(heightPx * grow));
    const key = `${sk0}#${lookKey(lk)}@${hpx}`;
    let R = rigCache.get(key);
    if (R) return R;
    const { w, h } = M;
    const N = w * h;
    const src = pixels(base, w, h);
    if (!src) return false;
    const layer = () => new ImageData(w, h);
    const bodyL = layer();
    const headL = layer();
    const wps = M.weapons.map(() => layer());
    const legs = M.legs && M.legs.split ? [layer(), layer(), layer(), layer()] : null;
    const G = M.legs;
    for (let i = 0; i < N; i++) {
      const p = i * 4;
      if (src[p + 3] === 0) continue;
      let dst = bodyL;
      if (M.head && M.head[i]) dst = headL;
      else {
        for (let k = 0; k < M.weapons.length; k++) if (M.weapons[k].mask[i]) { dst = wps[k]; break; }
      }
      for (let c = 0; c < 4; c++) dst.data[p + c] = src[p + c];
    }
    /* 물건을 뗀 자리 메우기 */
    const bd = bodyL.data;
    M.order.forEach(([i, nb]) => {
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      nb.forEach((j) => { const q = j * 4; if (bd[q + 3] > 0) { r += bd[q]; g += bd[q + 1]; b += bd[q + 2]; n++; } });
      if (!n) return;
      const p = i * 4;
      bd[p] = r / n;
      bd[p + 1] = g / n;
      bd[p + 2] = b / n;
      bd[p + 3] = 255;
    });
    /* 다리 오리기: [왼 허벅지, 왼 정강이, 오른 허벅지, 오른 정강이] */
    if (legs) {
      for (let y = G.top; y <= G.bottom; y++) {
        for (let x = G.x0; x <= G.x1; x++) {
          const p = (y * w + x) * 4;
          if (bd[p + 3] === 0) continue;
          const side = x < G.split[y] ? 0 : 1;
          const part = legs[side * 2 + (y < G.knee ? 0 : 1)];
          for (let c = 0; c < 4; c++) part.data[p + c] = bd[p + c];
          /* 무릎 이음새는 두 조각에 다 둔다 */
          if (Math.abs(y - G.knee) <= 1) { const o = legs[side * 2 + (y < G.knee ? 1 : 0)]; for (let c = 0; c < 4; c++) o.data[p + c] = bd[p + c]; }
          if (y >= G.fork) bd[p + 3] = 0;
        }
      }
    }
    const k = hpx / h;
    const W = Math.max(1, Math.round(w * k));
    const scale = (im) => {
      const t = canvas(w, h);
      t.getContext("2d").putImageData(im, 0, 0);
      const o = canvas(W, hpx);
      const g = o.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(t, 0, 0, W, hpx);
      return o;
    };
    const P = (pt) => [pt[0] * k, pt[1] * k];
    R = {
      W, H: hpx, k, ax: M.ax * k,
      body: scale(bodyL),
      head: M.head ? scale(headL) : null,
      neck: M.neck ? P(M.neck) : [M.ax * k, hpx * 0.4],
      weapons: M.weapons.map((wp, i) => ({ img: scale(wps[i]), grip: P(wp.grip) })),
      legs: legs ? { parts: legs.map(scale), hips: G.hips.map(P), knee: G.knee * k, bottom: G.bottom * k, fork: G.fork * k } : null,
      hem: G && !G.split ? { top: G.hem * k } : null
    };
    if (rigCache.size > 120) rigCache.clear();
    rigCache.set(key, R);
    return R;
  }

  /* ── 자세 ──
     각도는 라디안. 다리: 허벅지 a(+면 발이 앞으로), 무릎 b(+면 정강이가 뒤로 접힘). 몸통 lean(+면 앞으로 숙임).
     물건: wr(쥔 곳을 축으로 돌림, +면 시계 방향), wx·wy(키 비율만큼 옮김). 머리: hr, hy. ghost: 잔상 */
  const WALK_FPS = 9;
  const RUN_FPS = 13;
  const STANCE = { a: [0, 0], b: [0, 0] };
  /* 참고 시트(마법사의 밤)의 걷기·달리기 프레임에서 잰 발 위치. [뒤 발, 앞 발], 엉덩이에서 [앞으로, 아래로], 다리 길이 단위.
     세 장(내딛기 → 디딤 → 지나가기)을 그리고, 나머지 세 장은 두 다리를 바꿔 쓴다 */
  const WALK_KEYS = [[[-0.46, 0.97], [0.48, 0.98]], [[-0.6, 0.82], [0.26, 1]], [[0.04, 0.7], [-0.04, 1]]];
  const RUN_KEYS = [[[-0.74, 0.58], [0.62, 0.92]], [[-0.36, 0.48], [0.14, 1]], [[0.38, 0.6], [-0.56, 0.86]]];
  function stepFeet(key, swap) { return swap ? [key[1], key[0]] : [key[0], key[1]]; }
  /* 다리 둘(허벅지 L1, 정강이 L2)로 엉덩이에서 발까지: 무릎은 앞으로 굽는다. 돌려주는 값은 [허벅지 각, 무릎 굽힘] */
  function legIK(L1, L2, tx, ty) {
    let D = Math.hypot(tx, ty);
    D = Math.max(Math.abs(L1 - L2) + 0.5, Math.min(L1 + L2 - 0.01, D));
    const phi = Math.atan2(tx, ty);
    const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
    const t1 = phi + al;
    const kx = L1 * Math.sin(t1);
    const ky = L1 * Math.cos(t1);
    const t2 = Math.atan2(tx - kx, ty - ky);
    return [t1, t1 - t2];
  }
  /* 무기 동작별 [준비, 내지르기, 마무리] */
  const SWING = {
    slash: [{ wr: -0.95, lean: -0.08 }, { wr: 0.55, lean: 0.14, step: 1, ghost: 1 }, { wr: 0.3, lean: 0.06, step: 1 }],
    smash: [{ wr: -1.35, lean: -0.14, wy: -0.04 }, { wr: 0.75, lean: 0.2, crouch: 1, step: 1, ghost: 1 }, { wr: 0.55, lean: 0.12, crouch: 1, step: 1 }],
    twin: [{ wr: -0.8, lean: -0.06 }, { wr: 0.6, lean: 0.12, step: 1, ghost: 1 }, { wr: -0.3, lean: 0.08, step: 1, ghost: 1 }],
    thrust: [{ wx: -0.1, lean: -0.08 }, { wx: 0.22, lean: 0.12, step: 1, ghost: 1 }, { wx: 0.1, lean: 0.05, step: 1 }],
    stab: [{ wx: -0.07, wr: -0.2, lean: -0.06 }, { wx: 0.16, wr: 0.15, lean: 0.14, step: 1, ghost: 1 }, { wx: 0.06, lean: 0.05 }],
    lash: [{ wr: -1.1, wy: -0.03, lean: -0.1 }, { wr: 0.7, lean: 0.12, step: 1, ghost: 1 }, { wr: 0.35, lean: 0.05 }],
    sweep: [{ wr: -1.2, lean: -0.12 }, { wr: 0.9, lean: 0.16, step: 1, ghost: 1 }, { wr: 0.6, lean: 0.1, step: 1 }],
    jab: [{ lean: -0.06, wx: -0.03 }, { lean: 0.2, wx: 0.08, step: 1, ghost: 1 }, { lean: 0.06 }],
    shoot: [{ lean: -0.03, wr: -0.06 }, { lean: -0.1, wx: -0.05, wr: -0.12 }, { lean: -0.04, wx: -0.02 }],
    cast: [{ wr: -0.4, wy: -0.06, lean: -0.08, hr: -0.06 }, { wr: 0.35, wx: 0.05, lean: 0.12, step: 1 }],
    read: [{ wy: -0.03, lean: 0.06, hr: 0.08 }, { wx: 0.04, lean: 0.1, hr: 0.04 }],
    raise: [{ wy: -0.1, wr: -0.15, lean: -0.1, hr: -0.08 }, { wy: -0.06, wx: 0.05, lean: 0.04 }],
    play: [{ wr: 0.08, lean: 0.06 }, { wr: -0.08, lean: -0.04 }]
  };
  const LEGACY = { windup: ["slash", 0], strike: ["slash", 1], follow: ["slash", 2], melee: ["slash", 1] };
  /* 자세는 (동작, 몇째 장)마다 한 번만 만든다 */
  const poseMemo = new Map();
  const POSE_STEP = { walk: [WALK_FPS, 6], run: [RUN_FPS, 6], idle: [3.2, 4], climb: [6, 2], victory: [6, 2], play: [8, 2] };
  function poseOf(anim, t, f) {
    const st = POSE_STEP[anim] || (SWING[anim] || LEGACY[anim] ? null : POSE_STEP.idle);
    const key = anim + "|" + (st ? Math.floor(t * st[0]) % st[1] : f || 0);
    let P = poseMemo.get(key);
    if (!P) { P = makePose(anim, t, f); poseMemo.set(key, P); }
    return P;
  }
  function makePose(anim, t, f) {
    const P = { key: anim, legs: STANCE, feet: null, lean: 0, dy: 0, sy: 1, hr: 0, hy: 0, wr: 0, wx: 0, wy: 0, ghost: 0, hem: 0, flare: 0 };
    if (LEGACY[anim]) { f = LEGACY[anim][1]; anim = LEGACY[anim][0]; }
    if (SWING[anim]) {
      const list = SWING[anim];
      const i = anim === "play" ? Math.floor(t * 8) % 2 : Math.min(list.length - 1, f || 0);
      const S = list[i];
      Object.assign(P, S, { key: anim + i });
      if (S.step) P.feet = S.crouch ? [[-0.55, 0.76], [0.6, 0.78]] : [[-0.5, 0.95], [0.55, 0.9]];
      else P.feet = [[-0.2, 1], [0.22, 1]];
      if (S.step) P.flare = -0.1;
      return P;
    }
    switch (anim) {
      case "walk": {
        const i = Math.floor(t * WALK_FPS) % 6;
        const k = i % 3;
        const sg = i < 3 ? 1 : -1;
        return Object.assign(P, { key: "walk" + i, feet: stepFeet(WALK_KEYS[k], i >= 3), lean: 0.08, hy: k === 2 ? -0.012 : 0, wr: 0.03 * sg, hem: [0.08, 0.03, -0.03][k] * sg, flare: -0.05 });
      }
      case "run": {
        const i = Math.floor(t * RUN_FPS) % 6;
        const k = i % 3;
        const sg = i < 3 ? 1 : -1;
        return Object.assign(P, { key: "run" + i, feet: stepFeet(RUN_KEYS[k], i >= 3), lean: 0.28, hr: -0.1, hy: k === 2 ? -0.01 : 0, wr: -0.28 + 0.06 * sg, hem: -0.3 + 0.06 * sg, flare: -0.24, dy: k === 2 ? -0.05 : 0 });
      }
      case "jump": return Object.assign(P, { key: "jump", feet: [[-0.12, 0.6], [0.3, 0.66]], lean: -0.03, wr: -0.3, wy: -0.03, hr: -0.06, hem: -0.18, flare: 0.1 });
      case "fall": return Object.assign(P, { key: "fall", feet: [[-0.25, 0.92], [0.22, 0.82]], lean: 0.02, wr: -0.15, hy: 0.01, hem: 0.12, flare: 0.14 });
      case "land": return Object.assign(P, { key: "land", feet: [[-0.5, 0.7], [0.55, 0.72]], lean: 0.14, sy: 0.95, wr: 0.2, hy: 0.02, hr: 0.06, hem: 0.16 });
      case "climb": { const i = Math.floor(t * 6) % 2; return Object.assign(P, { key: "climb" + i, feet: i ? [[0.05, 0.62], [-0.04, 1]] : [[-0.04, 1], [0.05, 0.62]] }); }
      case "hurt": return Object.assign(P, { key: "hurt", feet: [[-0.3, 0.96], [0.08, 0.98]], lean: -0.22, hr: -0.15, wr: 0.35, hem: -0.1 });
      case "victory": { const i = Math.floor(t * 6) % 2; return Object.assign(P, { key: "victory" + i, wy: i ? -0.08 : -0.03, wr: -0.3, hr: -0.08, dy: i ? -0.04 : 0 }); }
      default: {
        /* 대기: 숨쉬기 네 장 */
        const i = Math.floor(t * 3.2) % 4;
        return Object.assign(P, { key: "idle" + i, sy: [1, 1.012, 1.022, 1.012][i], hy: [0, -0.004, -0.008, -0.004][i], wr: [0, 0.02, 0.035, 0.02][i] });
      }
    }
  }

  /* 2차원 변환 [a, b, c, d, e, f] */
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const rotAt = (x, y, r) => { const c = Math.cos(r); const s = Math.sin(r); return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y]; };
  const move = (x, y) => [1, 0, 0, 1, x, y];
  const scaleAt = (x, y, sx, sy) => [sx, 0, 0, sy, x - sx * x, y - sy * y];
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  /* 자세 하나를 그린 프레임. 원점은 그림의 왼쪽 위(여백 포함), anchorX·발밑이 땅 */
  const frameCache = new WeakMap();
  /* 새 프레임은 화면 한 번 그릴 때 두 장까지만 만든다(여럿이 처음 나타날 때 끊기지 않게). 못 만들면 null */
  let budgetAt = 0;
  let budget = 0;
  function frameOf(R, P, force) {
    let m = frameCache.get(R);
    if (!m) frameCache.set(R, (m = new Map()));
    let fr = m.get(P.key);
    if (fr) return fr;
    const now = clock();
    if (now - budgetAt > 0.012) { budgetAt = now; budget = 2; }
    if (!force && budget <= 0) return null;
    budget--;
    const padX = Math.ceil(R.H * 0.55);
    const padT = Math.ceil(R.H * 0.45);
    const out = canvas(R.W + padX * 2, R.H + padT);
    const g = out.getContext("2d");
    g.imageSmoothingEnabled = true;
    const H0 = R.H;
    /* 다리: 허벅지는 엉덩이, 정강이는 무릎을 축으로 */
    const legM = [];
    let footY = 0;
    let legs = P.legs;
    if (R.legs && P.feet) {
      /* 발 위치 → 다리 각도 */
      const L = R.legs;
      const a2 = [0, 0];
      const b2 = [0, 0];
      for (let s = 0; s < 2; s++) {
        const L1 = L.knee - L.hips[s][1];
        const L2 = L.bottom - L.knee;
        const len = L1 + L2;
        const r = legIK(L1, L2, P.feet[s][0] * len, P.feet[s][1] * len);
        a2[s] = r[0];
        b2[s] = r[1];
      }
      legs = { a: a2, b: b2 };
    }
    if (R.legs) {
      const L = R.legs;
      for (let s = 0; s < 2; s++) {
        const hip = L.hips[s];
        const th = rotAt(hip[0], hip[1], -legs.a[s]);
        const kneePt = [hip[0], L.knee];
        const kneeW = apply(th, kneePt[0], kneePt[1]);
        const sh = mul(th, rotAt(kneePt[0], kneePt[1], legs.b[s]));
        legM.push([th, sh]);
        const foot = apply(sh, hip[0], L.bottom);
        footY = Math.max(footY, foot[1], kneeW[1]);
      }
    }
    /* 발이 땅에 닿게 전체를 내린다(다리가 벌어지거나 굽으면 몸이 낮아진다) */
    const drop = R.legs ? R.legs.bottom - footY : 0;
    const base = move(padX, padT + drop + P.dy * H0);
    const pelvis = R.legs ? [(R.legs.hips[0][0] + R.legs.hips[1][0]) / 2, R.legs.fork] : [R.ax, H0 * 0.78];
    const bodyM = mul(base, mul(rotAt(pelvis[0], pelvis[1], P.lean), scaleAt(pelvis[0], pelvis[1], 1, P.sy)));
    const put = (img, M) => { g.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]); g.drawImage(img, 0, 0); };
    if (R.legs) {
      /* 뒤에 있는 다리(발이 뒤로 간 쪽)를 먼저 */
      const order = legs.a[0] < legs.a[1] ? [0, 1] : [1, 0];
      order.forEach((s) => {
        put(R.legs.parts[s * 2 + 1], mul(base, legM[s][1]));
        put(R.legs.parts[s * 2], mul(base, legM[s][0]));
      });
    }
    if (R.hem && P.hem) {
      /* 긴 옷: 옷단을 흔든다 */
      const top = R.hem.top;
      g.setTransform(bodyM[0], bodyM[1], bodyM[2], bodyM[3], bodyM[4], bodyM[5]);
      g.drawImage(R.body, 0, 0, R.W, top, 0, 0, R.W, top);
      const sk = mul(bodyM, [1, 0, P.hem, 1, -P.hem * top, 0]);
      g.setTransform(sk[0], sk[1], sk[2], sk[3], sk[4], sk[5]);
      g.drawImage(R.body, 0, top, R.W, R.H - top, 0, top, R.W, R.H - top);
    } else if (R.legs && P.flare) {
      /* 옷자락: 허리 아래를 뒤로(또는 위로) 날린다 */
      const waist = Math.round(R.legs.fork - (R.legs.fork - R.neck[1]) * 0.4);
      g.setTransform(bodyM[0], bodyM[1], bodyM[2], bodyM[3], bodyM[4], bodyM[5]);
      g.drawImage(R.body, 0, 0, R.W, waist, 0, 0, R.W, waist);
      const sk = mul(bodyM, [1, 0, P.flare, 1, -P.flare * waist, 0]);
      g.setTransform(sk[0], sk[1], sk[2], sk[3], sk[4], sk[5]);
      g.drawImage(R.body, 0, waist, R.W, R.H - waist, 0, waist, R.W, R.H - waist);
    } else put(R.body, bodyM);
    const headM = mul(bodyM, mul(move(0, P.hy * H0), rotAt(R.neck[0], R.neck[1], P.hr)));
    if (R.head) put(R.head, headM);
    R.weapons.forEach((wp, i) => {
      /* 둘째 물건(왼손)은 반대로 조금 덜 돈다 */
      const k = i ? -0.6 : 1;
      const M = mul(bodyM, mul(move(P.wx * H0 * (i ? 0.5 : 1), P.wy * H0), rotAt(wp.grip[0], wp.grip[1], P.wr * k)));
      put(wp.img, M);
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
    /* 덧그림용: 발밑 기준 좌표로 바꾼 몸통·머리 변환 */
    const ax = R.ax + padX;
    const toLocal = move(-ax, -out.height);
    const bodyL = mul(toLocal, mul(bodyM, move(R.ax, R.H)));
    const headL = mul(toLocal, mul(headM, move(R.ax, R.H)));
    /* 빈 여백을 잘라 그리는 양을 줄인다(발밑은 그대로 아래 끝) */
    fr = out;
    try {
      const d = g.getImageData(0, 0, out.width, out.height).data;
      let x0 = out.width;
      let x1 = -1;
      let y0 = out.height;
      for (let y = 0; y < out.height; y++) {
        for (let x = 0; x < out.width; x++) {
          if (d[(y * out.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
        }
      }
      if (x1 >= x0) {
        x0 = Math.max(0, x0 - 1);
        y0 = Math.max(0, y0 - 1);
        fr = canvas(x1 - x0 + 2, out.height - y0);
        fr.getContext("2d").drawImage(out, -x0, -y0);
        fr.anchorX = ax - x0;
      }
    } catch (e) { /* 그대로 둔다 */ }
    if (fr === out) fr.anchorX = ax;
    fr.bodyM = bodyL;
    fr.headM = headL;
    m.set(P.key, fr);
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
  /* ── 마법사 그림은 참고 시트의 프레임을 그대로 쓴다 ──
     대기, 걷기 3장, 달리기 3장, 공중, 착지, 공격 자세 4장(기본 공격·파이어볼·얼음·번개). 직업마다 옷 색만 바꿔 칠한다 */
  const SHEET_ART = "m_wizard";
  const SHEET = ["idle", "walk1", "walk2", "walk3", "run1", "run2", "run3", "air", "land", "atk1", "atk2", "atk3", "atk4"];
  const sheets = new Map();
  function sheetSet(job, hh) {
    const key = job.id + "@" + Math.round(hh);
    let set = sheets.get(key);
    if (set) return set;
    const lk = H.lookOf(job);
    const idle = fxImage("wiz_idle");
    if (!ready(idle)) return null;
    const k = (hh * 1.0) / idle.naturalHeight;
    const frames = {};
    for (const name of SHEET) {
      const b = bake("fx:wiz_" + name, lk);
      if (!b) return null;
      const bw = b.naturalWidth || b.width;
      const bh = b.naturalHeight || b.height;
      const cv = canvas(bw * k, bh * k);
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(b, 0, 0, cv.width, cv.height);
      /* 발밑 기준점: 몸통(위에서 45~75%) 가운데 */
      let sx = 0;
      let n = 0;
      try {
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        for (let y = Math.round(cv.height * 0.45); y < cv.height * 0.75; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 100) { sx += x; n++; }
      } catch (e) { /* 그대로 */ }
      cv.anchorX = n ? sx / n : cv.width * 0.5;
      frames[name] = cv;
    }
    set = { frames, A: anchors(analyze("fx:wiz_idle"), frames.idle) };
    if (sheets.size > 60) sheets.clear();
    sheets.set(key, set);
    return set;
  }
  function sheetFrame(anim, t, f, alt) {
    if (LEGACY[anim]) { f = LEGACY[anim][1]; anim = "slash"; }
    if (SWING[anim]) return alt ? (f ? "atk4" : "atk3") : f ? "atk1" : "atk2";
    switch (anim) {
      case "walk": return ["walk1", "walk2", "walk3"][Math.floor(t * 8) % 3];
      case "run": return ["run1", "run2", "run3"][Math.floor(t * 11) % 3];
      case "jump": return "air";
      case "fall": return "run3";
      case "land": return "land";
      case "climb": return Math.floor(t * 5) % 2 ? "air" : "idle";
      default: return "idle";
    }
  }
  function drawSheet(ctx, job, x, y, o, set, lk, hh) {
    const name = sheetFrame(o.anim, o.t || 0, o.f || 0, o.alt);
    const fr = set.frames[name];
    const T = o.time !== undefined ? o.time : clock();
    const dir = o.dir || 1;
    const A = set.A;
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (lk.ghost ? 0.6 : 1);
    /* 대기는 숨쉬듯 아주 조금 */
    const breath = name === "idle" ? 1 + 0.012 * Math.sin(T * 2.6) : 1;
    let dy = 0;
    if (lk.float) dy -= (0.03 + Math.sin(T * 2.4) * 0.015) * hh;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + dy));
    ctx.scale(dir * lk.wide, breath);
    ctx.imageSmoothingEnabled = !o.crisp;
    ctx.globalAlpha = alpha;
    if (lk.aura) aura(ctx, lk.aura, A, T, false);
    if (lk.wings) wings(ctx, lk.wings, A, T);
    if (lk.rarity >= 3) {
      const gl = glow(fr, F.sprites.RARITY_COLOR[lk.rarity]);
      ctx.globalAlpha = alpha * (0.45 + 0.12 * (lk.rarity - 3) + Math.sin(T * 3) * 0.2);
      ctx.drawImage(gl, -fr.anchorX - gl.pad, -fr.height - gl.pad);
      ctx.globalAlpha = alpha;
    }
    if (name === "atk1" || name === "atk4") {
      const gh = tinted(fr, "#c8d4ff", 0.55);
      [[0.3, 0.08], [0.15, 0.16]].forEach(([a, off]) => { ctx.globalAlpha = alpha * a; ctx.drawImage(gh, -fr.anchorX - off * hh, -fr.height); });
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(lk.ghost ? tinted(fr, "#a8dcff", 0.3) : fr, -fr.anchorX, -fr.height);
    if (o.tint) {
      ctx.globalAlpha = alpha * (o.tintA || 0.5);
      ctx.drawImage(tinted(fr, o.tint, 1), -fr.anchorX, -fr.height);
      ctx.globalAlpha = alpha;
    }
    if (lk.crown) crown(ctx, A);
    if (lk.halo) halo(ctx, A, T);
    if (lk.aura) aura(ctx, lk.aura, A, T, true);
    ctx.restore();
    return { w: fr.width, h: fr.height, hand: [x + dir * fr.width * 0.4, y - fr.height * 0.5] };
  }

  /* 직업·키마다 준비한 것(그림, 부위, 덧그림 기준점)을 한 번만 찾는다 */
  const ready2 = new Map();
  function prep(job, hh) {
    const key = job.id + "@" + Math.round(hh);
    let r = ready2.get(key);
    if (r) return r;
    const base = sprite(job, hh);
    if (!base) return null;
    const R = rigOf(job, hh);
    if (R === null) return { base, R: null, pending: true };
    const lk = H.lookOf(job);
    const sk0 = srcKey(job, lk);
    r = { base, R, A: anchors(analyze(sk0), base), beast: beastKey(sk0), headDeco: !!(lk.horns || lk.ears || lk.crown || lk.halo), backDeco: !!(lk.aura || lk.wings) };
    if (ready2.size > 400) ready2.clear();
    ready2.set(key, r);
    return r;
  }
  function draw(ctx, job, x, y, o) {
    const lk = H.lookOf(job);
    const hh = o.h * lk.size;
    if (!o.still && H.heroArtId(job) === SHEET_ART) {
      const set = sheetSet(job, hh);
      if (set) return drawSheet(ctx, job, x, y, o, set, lk, hh);
    }
    const pr = o.still ? null : prep(job, hh);
    const base = o.still ? sprite(job, hh) : pr && pr.base;
    if (base && o.still) {
      /* 운명 뽑기의 빠른 깜빡임처럼 잠깐만 보이는 그림은 부위로 나누지 않고 그대로 */
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale((o.dir || 1) * lk.wide, 1);
      if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
      ctx.drawImage(base, -base.anchorX, -base.height);
      ctx.restore();
      return { w: base.width, h: base.height, hand: [x, y - base.height * 0.45] };
    }
    const R = pr && pr.R;
    if (!base || !R) return drawDoll(ctx, job, x, y, o);
    const P = poseOf(o.anim, o.t || 0, o.f || 0);
    /* 이번에 못 만든 프레임은 이미 있는 대기 프레임으로 대신한다 */
    const fr = frameOf(R, P, o.time !== undefined) || frameOf(R, poseOf("idle", 0, 0), true);
    const T = o.time !== undefined ? o.time : clock();
    let dy = 0;
    if (lk.float) dy -= (0.03 + Math.sin(T * 2.4) * 0.015) * hh;
    const dir = o.dir || 1;
    const A = pr.A;
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (lk.ghost ? 0.6 : 1);
    const fx = -fr.anchorX;
    const fy = -fr.height;
    const at = (M) => ctx.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + dy));
    ctx.scale(dir * lk.wide, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alpha;
    /* 몸 뒤: 기운·날개(몸통을 따라 기운다) */
    if (pr.backDeco) {
      ctx.save();
      at(fr.bodyM);
      if (lk.aura) aura(ctx, lk.aura, A, T, false);
      if (lk.wings) wings(ctx, lk.wings, A, T);
      ctx.restore();
    }
    if (lk.rarity >= 3) {
      const gl = glow(fr, F.sprites.RARITY_COLOR[lk.rarity]);
      ctx.globalAlpha = alpha * (0.45 + 0.12 * (lk.rarity - 3) + Math.sin(T * 3) * 0.2);
      ctx.drawImage(gl, fx - gl.pad, fy - gl.pad);
      ctx.globalAlpha = alpha;
    }
    if (lk.clone === "twin") {
      const b = Math.sin(T * 2.6 + 1.5) * A.H * 0.012;
      ctx.drawImage(tinted(fr, "#1a1430", 0.3), fx - A.W * 0.3, fy * 0.94 + b, fr.width * 0.94, fr.height * 0.94);
    } else if (lk.clone === "shadow") {
      ctx.globalAlpha = alpha * 0.45;
      ctx.drawImage(tinted(fr, "#140a24", 0.88), fx - A.W * (0.22 + Math.sin(T * 1.6) * 0.05), fy);
      ctx.globalAlpha = alpha;
    }
    /* 잔상: 공격이 맞는 순간 */
    if (P.ghost) {
      const gh = tinted(fr, "#c8d4ff", 0.55);
      [[0.32, 0.1], [0.16, 0.2]].forEach(([a, off]) => {
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
    /* 머리 덧그림(뿔·귀·왕관·고리)은 머리를 따라 */
    if (pr.headDeco) {
      ctx.save();
      at(fr.headM);
      if (!pr.beast && lk.horns && (A.bare || lk.horns !== "tusk")) horns(ctx, lk.horns, A);
      if (!pr.beast && lk.ears && (A.bare || lk.ears !== "elf")) ears(ctx, lk.ears, A);
      if (lk.crown) crown(ctx, A);
      if (lk.halo) halo(ctx, A, T);
      ctx.restore();
    }
    if (lk.aura) {
      ctx.save();
      at(fr.bodyM);
      aura(ctx, lk.aura, A, T, true);
      ctx.restore();
    }
    ctx.restore();
    return { w: base.width, h: base.height, hand: [x + dir * base.width * 0.36, y - base.height * 0.45] };
  }

  /* 움직이지 않는 그림: 직업 그림(색·머리) 그대로에 날개·기운·뿔·귀·왕관·고리와 등급 빛을 얹는다.
     도감·운명 뽑기의 프로필 그림과 게임 화면이 같은 모습이다. o: dir, h, alpha, tint, tintA */
  const STILL_T = 0.6;
  const stillA = new WeakMap();
  function drawStill(ctx, job, x, y, o) {
    const lk = H.lookOf(job);
    const hh = o.h * lk.size;
    const base = sprite(job, hh);
    if (!base) return drawDoll(ctx, job, x, y, o);
    let A = stillA.get(base);
    if (!A) { A = anchors(analyze(srcKey(job, lk)), base); stillA.set(base, A); }
    const T = STILL_T;
    const alpha = (o.alpha === undefined ? 1 : o.alpha) * (lk.ghost ? 0.6 : 1);
    const fx = -base.anchorX;
    const fy = -base.height;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - (lk.float ? 0.03 * hh : 0)));
    ctx.scale((o.dir || 1) * lk.wide, 1);
    ctx.imageSmoothingEnabled = !o.crisp;
    ctx.globalAlpha = alpha;
    if (lk.aura) aura(ctx, lk.aura, A, T, false);
    if (lk.wings) wings(ctx, lk.wings, A, T);
    if (lk.rarity >= 3) {
      const gl = glow(base, F.sprites.RARITY_COLOR[lk.rarity]);
      ctx.globalAlpha = alpha * (0.5 + 0.12 * (lk.rarity - 3));
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(gl, fx - gl.pad, fy - gl.pad);
      ctx.imageSmoothingEnabled = !o.crisp;
      ctx.globalAlpha = alpha;
    }
    if (lk.clone === "twin") ctx.drawImage(tinted(base, "#1a1430", 0.3), fx - A.W * 0.3, fy * 0.94, base.width * 0.94, base.height * 0.94);
    else if (lk.clone === "shadow") {
      ctx.globalAlpha = alpha * 0.45;
      ctx.drawImage(tinted(base, "#140a24", 0.88), fx - A.W * 0.22, fy);
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(lk.ghost ? tinted(base, "#a8dcff", 0.3) : base, fx, fy);
    if (o.tint) {
      ctx.globalAlpha = alpha * (o.tintA || 0.5);
      ctx.drawImage(tinted(base, o.tint, 1), fx, fy);
      ctx.globalAlpha = alpha;
    }
    const beast = beastKey(srcKey(job, lk));
    if (!beast && lk.horns && (A.bare || lk.horns !== "tusk")) horns(ctx, lk.horns, A);
    if (!beast && lk.ears && (A.bare || lk.ears !== "elf")) ears(ctx, lk.ears, A);
    if (lk.crown) crown(ctx, A);
    if (lk.halo) halo(ctx, A, T);
    if (lk.aura) aura(ctx, lk.aura, A, T, true);
    ctx.restore();
    return { w: base.width, h: base.height, hand: [x + (o.dir || 1) * base.width * 0.36, y - base.height * 0.45] };
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
    drawStill(cv.getContext("2d"), job, cv.width * 0.56, cv.height - 2, { dir: 1, h: hh / lk.size });
    const out = cv.toDataURL("image/png");
    if (thumbs.size > 600) thumbs.clear();
    thumbs.set(job.id, out);
    return out;
  }

  /* ── 직업 카드의 프로필: 그 직업 캐릭터의 상반신 ──
     얼굴 크기를 맞춰 확대하고, 속성 빛 배경·계열마다 다른 무늬·등급 테두리를 두른다.
     같은 계열이라도 직업마다 캐릭터·색·바라보는 쪽·배경 반짝임이 달라 프로필이 모두 다르다 */
  const PF_BG = {
    phys: ["#3a3f5c", "#8c93b8"], fire: ["#4a1612", "#e0602a"], ice: ["#12304a", "#7cd8f0"], bolt: ["#3a3010", "#f0d040"],
    earth: ["#3a2614", "#c08848"], wind: ["#123a2a", "#7ee0a0"], light: ["#4a3a14", "#ffe48a"], dark: ["#1e0e30", "#a050d8"],
    nature: ["#16341a", "#7ccc58"], arcane: ["#24143e", "#c080f0"]
  };
  const profiles = new Map();
  function pfHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function pfBackground(g, job, S) {
    const [deep, lit] = PF_BG[job.el] || PF_BG.phys;
    const fam = F.FAMILY_LIST[job.fam];
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, lit);
    grd.addColorStop(0.55, deep);
    grd.addColorStop(1, "#0a0816");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    const glow = g.createRadialGradient(S * 0.5, S * 0.38, S * 0.05, S * 0.5, S * 0.38, S * 0.6);
    glow.addColorStop(0, "rgba(255,255,255,0.42)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, S, S);
    /* 계열마다 무늬: 빛살 · 사선 · 격자 · 물결 */
    g.save();
    g.globalAlpha = 0.16;
    g.strokeStyle = "#ffffff";
    g.fillStyle = "#ffffff";
    g.lineWidth = S / 120;
    const kind = fam.idx % 4;
    if (kind === 0) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        g.beginPath();
        g.moveTo(S * 0.5, S * 0.38);
        g.lineTo(S * 0.5 + Math.cos(a) * S, S * 0.38 + Math.sin(a) * S);
        g.lineTo(S * 0.5 + Math.cos(a + 0.12) * S, S * 0.38 + Math.sin(a + 0.12) * S);
        g.fill();
      }
    } else if (kind === 1) {
      for (let x = -S; x < S * 2; x += S / 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + S, S); g.stroke(); }
    } else if (kind === 2) {
      for (let x = S / 16; x < S; x += S / 8) for (let y = S / 16; y < S; y += S / 8) g.fillRect(x, y, S / 60, S / 60);
    } else {
      for (let y = S * 0.1; y < S; y += S / 9) {
        g.beginPath();
        for (let x = 0; x <= S; x += S / 24) g.lineTo(x, y + Math.sin(x / S * Math.PI * 4) * S / 40);
        g.stroke();
      }
    }
    g.restore();
    /* 직업마다 다른 자리에 반짝이는 빛 알갱이 */
    let h = pfHash(job.name);
    const rnd = () => { h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return h / 4294967296; };
    for (let k = 0; k < 9 + job.rarity * 3; k++) {
      const x = rnd() * S;
      const y = rnd() * S * 0.8;
      const r = (0.6 + rnd() * 1.4) * S / 120;
      g.globalAlpha = 0.35 + rnd() * 0.5;
      g.fillStyle = k % 3 ? lit : "#ffffff";
      g.fillRect(x - r, y - r * 3, r * 2, r * 6);
      g.fillRect(x - r * 3, y - r, r * 6, r * 2);
    }
    g.globalAlpha = 1;
  }
  function pfFrame(g, job, S) {
    const col = F.sprites.RARITY_COLOR[job.rarity];
    const b = Math.round(S / 40);
    const shade = g.createLinearGradient(0, S * 0.62, 0, S);
    shade.addColorStop(0, "rgba(8,6,20,0)");
    shade.addColorStop(1, "rgba(8,6,20,0.75)");
    g.fillStyle = shade;
    g.fillRect(0, S * 0.62, S, S * 0.38);
    g.lineWidth = b;
    g.strokeStyle = "#0c0a1c";
    g.strokeRect(b * 1.5, b * 1.5, S - b * 3, S - b * 3);
    g.strokeStyle = col;
    g.strokeRect(b / 2, b / 2, S - b, S - b);
    /* 별: 등급만큼(일반 1 … 신화 6) */
    for (let k = 0; k <= job.rarity; k++) {
      const cx = b * 4 + k * b * 3.4;
      const cy = S - b * 4;
      const r = b * 1.4;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.45 : r;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = col;
      g.strokeStyle = "#0c0a1c";
      g.lineWidth = b / 2;
      g.fill();
      g.stroke();
    }
    if (job.rarity >= 3) {
      g.fillStyle = col;
      [[b, b], [S - b * 4, b], [b, S - b * 4], [S - b * 4, S - b * 4]].forEach(([x, y]) => g.fillRect(x, y, b * 3, b * 3));
    }
  }
  /* 그림에서 얼굴과 이어진 머리의 가장 높은 곳(발밑 기준 y). 턱 위, 얼굴 둘레만 따라가서 옆에 세운 지팡이는 빼고 */
  function headTop(cv, A) {
    const W = cv.width;
    const Hh = cv.height;
    const d = cv.getContext("2d").getImageData(0, 0, W, Hh).data;
    const cx = A.ax + A.fx;
    const cy = Hh + A.fy;
    const x0 = Math.max(0, Math.floor(cx - A.fw * 1.3));
    const x1 = Math.min(W - 1, Math.ceil(cx + A.fw * 1.3));
    const y1 = Math.min(Hh - 1, Math.round(cy + A.fw * 0.3));
    const seen = new Uint8Array(W * Hh);
    const st = [];
    for (let y = Math.round(cy - A.fw * 0.2); y <= Math.round(cy + A.fw * 0.2); y++) {
      for (let x = Math.round(cx - A.fw * 0.2); x <= Math.round(cx + A.fw * 0.2); x++) {
        const i = y * W + x;
        if (y >= 0 && y < Hh && x >= 0 && x < W && d[i * 4 + 3] > 100 && !seen[i]) { seen[i] = 1; st.push(i); }
      }
    }
    let top = cy;
    while (st.length) {
      const i = st.pop();
      const x = i % W;
      const y = (i - x) / W;
      if (y < top) top = y;
      [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].forEach(([X, Y]) => {
        if (X < x0 || X > x1 || Y < 0 || Y > y1) return;
        const j = Y * W + X;
        if (seen[j] || d[j * 4 + 3] <= 100) return;
        seen[j] = 1;
        st.push(j);
      });
    }
    return top - Hh;
  }
  function profile(job) {
    if (profiles.has(job.id)) return profiles.get(job.id);
    const lk = H.lookOf(job);
    const inf = analyze(srcKey(job, lk));
    const body = image(H.heroArtId(job));
    if (!inf || !sprite(job, 10) || !body || !body.naturalHeight) return url(job);
    /* 그림 픽셀을 정수 배로만 키워 또렷하게(부드럽게 늘리면 머리가 뭉개진다). 얼굴 폭이 액자의 26%쯤 되는 배율을 고르고,
       액자 크기를 그 배율에 맞춘다(화면에서는 같은 크기로 보인다) */
    const h0 = body.naturalHeight / lk.size;
    const base = sprite(job, body.naturalHeight);
    if (!base) return url(job);
    const A = anchors(inf, base);
    const k = Math.max(1, Math.min(4, Math.round((240 * 0.26) / Math.max(1, A.fw))));
    /* 머리 꼭대기(머리카락·모자·투구)까지 액자 안에 들어오게: 얼굴을 내리고, 그래도 넘치면 액자를 넓힌다 */
    const up = (A.fy - headTop(base, A)) * k;
    const S = Math.max(Math.round((k * A.fw) / 0.26), Math.ceil(up / 0.49));
    const fy = Math.max(S * 0.46, Math.min(S * 0.56, S * 0.07 + up));
    const dir = pfHash(job.name) & 1 ? 1 : -1;
    const cv = canvas(S, S);
    const g = cv.getContext("2d");
    pfBackground(g, job, S);
    const x = S * 0.5 - A.fx * k * dir * lk.wide;
    const y = fy - A.fy * k + (lk.float ? 0.03 * base.height * k : 0);
    g.save();
    g.scale(k, k);
    drawStill(g, job, x / k, y / k, { dir, h: h0, crisp: true });
    g.restore();
    pfFrame(g, job, S);
    const out = cv.toDataURL("image/png");
    if (profiles.size > 300) profiles.clear();
    profiles.set(job.id, out);
    return out;
  }

  /* 장면에 들어설 때 미리: 부위 나누기와 대기·걷기 프레임 */
  function warm(job, h) {
    const lk = H.lookOf(job);
    const pr = prep(job, h * lk.size);
    if (!pr || !pr.R) return;
    frameOf(pr.R, poseOf("idle", 0, 0), true);
    for (let i = 0; i < 6; i++) frameOf(pr.R, poseOf("walk", (i + 0.5) / WALK_FPS, 0), true);
  }

  F.heroArt = { warm, preload, sprite, draw, drawStill, url, profile, image, analyze, headOf, compose, headFor, rigOf, frameOf };
})(typeof window !== "undefined" ? window : globalThis);
