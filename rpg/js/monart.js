/*
 * 삼천의 운명 — 몬스터 일러스트
 * 몬스터마다 코드로 그리는 그림이다. 100×100 칸 위에 부위(몸통·머리·팔다리·날개·뿔·무기)를 겹쳐 그리고,
 * 부위마다 위쪽은 밝게·아래쪽은 어둡게 칠한 뒤 색 외곽선을 두른다. 마지막에 가장자리를 또렷하게 다듬는다.
 * 모든 몬스터는 오른쪽을 본다(전투에서는 뒤집어 주인공 쪽을 보게 한다). 땅은 y=96.
 */
(function (root) {
  "use strict";
  const F = root.FATES;

  /* ── 색 ── */
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hex(r, g, b) {
    const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
    return "#" + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
  }
  function hsl(c) {
    const [r, g, b] = rgb(c).map((v) => v / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    let h = 0;
    let s = 0;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      t = ((t % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return hex(f(h / 360 + 1 / 3) * 255, f(h / 360) * 255, f(h / 360 - 1 / 3) * 255);
  }
  /* 그림자는 푸른 쪽으로, 빛은 노란 쪽으로 색을 살짝 돌린다 */
  function toward(h, target, amt) {
    let d = target - h;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return h + Math.sign(d) * Math.min(Math.abs(d), amt);
  }
  function dark(c, k) {
    const [h, s, l] = hsl(c);
    const kk = k === undefined ? 1 : k;
    return fromHsl(s < 0.08 ? h : toward(h, 250, 16 * kk), s + 0.06 * kk, l - 0.16 * kk);
  }
  function light(c, k) {
    const [h, s, l] = hsl(c);
    const kk = k === undefined ? 1 : k;
    return fromHsl(s < 0.08 ? h : toward(h, 55, 10 * kk), s - 0.02 * kk, l + 0.14 * kk);
  }
  function inkOf(c) {
    const [h, s, l] = hsl(c);
    return fromHsl(s < 0.08 ? 255 : toward(h, 262, 24), Math.min(0.6, s + 0.12), Math.max(0.07, l * 0.28));
  }
  function mix(a, b, t) {
    const A = rgb(a);
    const B = rgb(b);
    return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }

  /* ── 모양 만들기(Path2D) ── */
  function ell(cx, cy, rx, ry, rot) {
    const p = new Path2D();
    p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
    return p;
  }
  /* 점들을 부드럽게 잇는 닫힌(또는 열린) 곡선 */
  function curveThrough(p, pts, closed, start) {
    const n = pts.length;
    const at = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    if (start !== false) p.moveTo(pts[0][0], pts[0][1]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1);
      const p1 = at(i);
      const p2 = at(i + 1);
      const p3 = at(i + 2);
      p.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
  }
  function blob(pts) {
    const p = new Path2D();
    curveThrough(p, pts, true);
    p.closePath();
    return p;
  }
  function poly(pts) {
    const p = new Path2D();
    pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
    p.closePath();
    return p;
  }
  function rrect(x, y, w, h, r) {
    const p = new Path2D();
    p.roundRect(x, y, w, h, r);
    return p;
  }
  /* 굵기가 변하는 관(팔다리·꼬리·촉수·목): 점마다 굵기 */
  function tube(pts, ws) {
    const n = pts.length;
    const w = (i) => (Array.isArray(ws) ? ws[Math.min(i, ws.length - 1)] : ws) / 2;
    const nor = pts.map((pt, i) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const d = Math.hypot(dx, dy) || 1;
      return [-dy / d, dx / d];
    });
    const L = pts.map((pt, i) => [pt[0] + nor[i][0] * w(i), pt[1] + nor[i][1] * w(i)]);
    const R = pts.map((pt, i) => [pt[0] - nor[i][0] * w(i), pt[1] - nor[i][1] * w(i)]).reverse();
    const p = new Path2D();
    curveThrough(p, L, false);
    const e = n - 1;
    const ae = Math.atan2(nor[e][1], nor[e][0]);
    p.arc(pts[e][0], pts[e][1], Math.max(0.01, w(e)), ae, ae - Math.PI, true);
    curveThrough(p, R, false, false);
    const a0 = Math.atan2(nor[0][1], nor[0][0]);
    p.arc(pts[0][0], pts[0][1], Math.max(0.01, w(0)), a0 + Math.PI, a0, true);
    p.closePath();
    return p;
  }
  function union(...ps) {
    const p = new Path2D();
    ps.forEach((q) => p.addPath(q));
    return p;
  }
  function moved(path, dx, dy) {
    const p = new Path2D();
    p.addPath(path, new DOMMatrix().translate(dx, dy));
    return p;
  }
  function turned(path, cx, cy, ang, sx, sy) {
    const p = new Path2D();
    p.addPath(path, new DOMMatrix().translate(cx, cy).rotate((ang * 180) / Math.PI).scale(sx || 1, sy || sx || 1).translate(-cx, -cy));
    return p;
  }
  /* 원 둘레의 점(각도는 도 단위, 0=오른쪽, 90=아래) */
  const pol = (cx, cy, r, deg) => [cx + Math.cos((deg * Math.PI) / 180) * r, cy + Math.sin((deg * Math.PI) / 180) * r];

  /* ── 붓: 한 장의 그림을 그리는 도구 ── */
  /* fit: 그림 전체를 땅 가운데(50,96)를 중심으로 줄인다 */
  function painter(g, L, fit) {
    const f = fit || 1;
    const u = (L / 100) * f;
    const ox = (L / 100) * 50 * (1 - f);
    const oy = (L / 100) * 96 * (1 - f);
    const px = (n) => n / u;
    const glows = [];
    g.setTransform(u, 0, 0, u, ox, oy);
    g.lineJoin = "round";
    g.lineCap = "round";
    /* 부위 하나: 빛(위)·바탕·그림자(아래) 세 단과 외곽선 */
    function part(path, col, o) {
      const op = o || {};
      const base = col;
      const lt = op.light || light(col, op.lk);
      const dk = op.dark || dark(col, op.dk);
      const d = op.d === undefined ? 3.2 : op.d;
      const l = op.l === undefined ? 1.8 : op.l;
      const lx = op.lx === undefined ? -0.35 : op.lx;
      g.fillStyle = op.flat ? base : lt;
      g.fill(path);
      if (!op.flat) {
        g.save();
        g.clip(path);
        g.fillStyle = base;
        g.fill(moved(path, -lx * l, l));
        if (d > 0) {
          const ring = new Path2D();
          ring.rect(-200, -200, 600, 600);
          ring.addPath(path, new DOMMatrix().translate(lx * d, -d));
          g.fillStyle = dk;
          g.fill(ring, "evenodd");
        }
        g.restore();
      }
      if (op.line !== false) {
        g.lineWidth = px(op.lw || 2);
        g.strokeStyle = op.ink || inkOf(col);
        g.stroke(path);
      }
    }
    function fill(path, col) {
      g.fillStyle = col;
      g.fill(path);
    }
    /* 부위 안쪽에만 칠하기(무늬·배·얼룩) */
    function inside(clip, path, col, o) {
      g.save();
      g.clip(clip);
      if (o && o.part) part(path, col, Object.assign({ line: false }, o));
      else fill(path, col);
      g.restore();
    }
    function stroke(pts, col, w, closed) {
      const p = new Path2D();
      if (pts.length > 2 && !closed) curveThrough(p, pts, false);
      else pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
      if (closed) p.closePath();
      g.lineWidth = px(w || 2);
      g.strokeStyle = col;
      g.stroke(p);
    }
    /* 눈: round(흰자·눈동자) · slit(파충류) · glow(빛나는 눈) · cute(까만 눈) · angry(눈썹) · closed(감은 눈) */
    function eye(x, y, r, o) {
      const op = o || {};
      const t = op.type || "round";
      const iris = op.iris || "#e8b830";
      if (t === "closed") {
        stroke([[x - r, y], [x, y + r * 0.5], [x + r, y]], op.ink || "#1a1020", Math.max(1.6, r * 0.5 * u));
        return;
      }
      if (t === "glow") {
        fill(ell(x, y, r * 1.05, r * (op.squint ? 0.55 : 0.9)), iris);
        fill(ell(x + r * 0.15, y - r * 0.05, r * 0.45, r * (op.squint ? 0.25 : 0.42)), "#ffffff");
        glows.push({ x, y, r: r * 3.2, col: iris, a: 0.55 });
        return;
      }
      if (t === "cute") {
        part(ell(x, y, r * 0.8, r), "#1a1428", { line: false, d: 0, l: 0 });
        fill(ell(x - r * 0.25, y - r * 0.35, r * 0.32, r * 0.32), "#ffffff");
        fill(ell(x + r * 0.25, y + r * 0.3, r * 0.15, r * 0.15), "#ffffff");
        return;
      }
      const sq = op.squint ? 0.6 : 1;
      part(ell(x, y, r, r * 0.9 * sq), op.white || "#f4f0e8", { d: r * 0.25, l: 0, lw: 1.6, ink: op.ink });
      g.save();
      g.clip(ell(x, y, r, r * 0.9 * sq));
      const ix = x + (op.look === undefined ? r * 0.25 : op.look);
      fill(ell(ix, y, r * 0.62, r * 0.7), iris);
      fill(ell(ix, y, t === "slit" ? r * 0.14 : r * 0.32, t === "slit" ? r * 0.6 : r * 0.36), "#120c18");
      fill(ell(ix - r * 0.22, y - r * 0.28, r * 0.2, r * 0.2), "#ffffff");
      g.restore();
      if (t === "angry" || op.brow) {
        stroke([[x - r * 1.15, y - r * 1.25], [x + r * 1.1, y - r * 0.55]], op.ink || "#1a1020", Math.max(2, r * 0.55 * u));
      }
    }
    function glow(x, y, r, col, a) {
      glows.push({ x, y, r, col, a: a === undefined ? 0.5 : a });
    }
    /* 이빨: (x1,y1)→(x2,y2) 선을 따라 n개, h는 길이(아래로 +) */
    function teeth(x1, y1, x2, y2, n, h, col) {
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const ax = x1 + (x2 - x1) * t0;
        const ay = y1 + (y2 - y1) * t0;
        const bx = x1 + (x2 - x1) * t1;
        const by = y1 + (y2 - y1) * t1;
        part(poly([[ax, ay], [bx, by], [(ax + bx) / 2, (ay + by) / 2 + h]]), col || "#f6f0dc", { d: 0, l: 0, lw: 1.2 });
      }
    }
    /* 뿔: 밑동(x,y)에서 각도 ang(도)로 len만큼, bend로 휘게 */
    function horn(x, y, len, ang, bend, w, col, o) {
      const pts = [];
      for (let i = 0; i <= 5; i++) {
        const t = i / 5;
        const a = ang + bend * t * t;
        const prev = pts.length ? pts[pts.length - 1] : [x, y];
        pts.push(i ? pol(prev[0], prev[1], len / 5, a) : [x, y]);
      }
      const ws = pts.map((_, i) => w * (1 - i / 5.4));
      part(tube(pts, ws), col, Object.assign({ d: w * 0.35, l: w * 0.2 }, o));
      if (o && o.rings) for (let i = 1; i < 4; i++) {
        const p = pts[i];
        const q = pts[i + 1];
        const nx = -(q[1] - p[1]);
        const ny = q[0] - p[0];
        const d = Math.hypot(nx, ny) || 1;
        const r = ws[i] * 0.5;
        stroke([[p[0] + (nx / d) * r, p[1] + (ny / d) * r], [p[0] - (nx / d) * r, p[1] - (ny / d) * r]], dark(col, 1.4), 1.2);
      }
      return pts[5];
    }
    /* 박쥐 날개: 어깨(x,y), 펼친 길이 s, 각도 ang(도, -90=위) */
    function batWing(x, y, s, ang, col, mem, o) {
      const op = o || {};
      const tipA = ang;
      const elbow = pol(x, y, s * 0.42, tipA - 25);
      const tip = pol(x, y, s, tipA - 12);
      const f1 = pol(elbow[0], elbow[1], s * 0.62, tipA + 18);
      const f2 = pol(elbow[0], elbow[1], s * 0.5, tipA + 48);
      const f3 = pol(elbow[0], elbow[1], s * 0.36, tipA + 82);
      const base2 = pol(x, y, s * 0.18, tipA + 110);
      const sag = (a, b, k) => [(a[0] + b[0]) / 2 + (x - (a[0] + b[0]) / 2) * k, (a[1] + b[1]) / 2 + (y - (a[1] + b[1]) / 2) * k];
      const memPath = new Path2D();
      memPath.moveTo(x, y);
      memPath.lineTo(elbow[0], elbow[1]);
      memPath.lineTo(tip[0], tip[1]);
      [[tip, f1], [f1, f2], [f2, f3], [f3, base2]].forEach(([a, b]) => {
        const m = sag(a, b, 0.22);
        memPath.quadraticCurveTo(m[0], m[1], b[0], b[1]);
      });
      memPath.closePath();
      part(memPath, mem || dark(col, 0.6), { d: 2.4, l: 1.2, lw: op.lw || 1.8 });
      [tip, f1, f2, f3].forEach((f) => part(tube([elbow, f], [2.4, 1]), col, { d: 0.6, l: 0.4, lw: 1.4 }));
      part(tube([[x, y], elbow], [3.6, 2.6]), col, { d: 1, l: 0.6, lw: 1.6 });
      part(poly([pol(elbow[0], elbow[1], 3.4, tipA - 120), pol(elbow[0], elbow[1], 3.2, tipA - 60), pol(elbow[0], elbow[1], 6.5, tipA - 92)]), op.claw || "#e8e0d0", { d: 0, l: 0, lw: 1.2 });
    }
    /* 깃털 날개: 어깨(x,y), 길이 s, 각도 ang(도), 깃털 수 n */
    function featherWing(x, y, s, ang, col, o) {
      const op = o || {};
      const n = op.n || 6;
      const tip = op.tip || light(col, 0.5);
      for (let k = n - 1; k >= 0; k--) {
        const a = ang + (k - n * 0.25) * (op.spread || 11);
        const len = s * (0.55 + 0.45 * Math.sin(((k + 1) / (n + 1)) * Math.PI * 0.95 + 0.25));
        const end = pol(x, y, len, a);
        const mid = pol(x, y, len * 0.55, a - 4);
        part(blob([[x, y], pol(mid[0], mid[1], s * 0.1, a - 90), end, pol(mid[0], mid[1], s * 0.08, a + 90)]), k % 2 ? col : tip, { d: 1.4, l: 0.8, lw: 1.5 });
      }
      part(ell(x, y, s * 0.22, s * 0.16, ((ang + 20) * Math.PI) / 180), op.cover || col, { d: 1.6, l: 1, lw: 1.6 });
    }
    function crown(x, y, w, h, col, gem) {
      const c = col || "#f0c040";
      const pts = [[x - w / 2, y], [x - w / 2, y - h * 0.55], [x - w / 4, y - h * 0.2], [x, y - h], [x + w / 4, y - h * 0.2], [x + w / 2, y - h * 0.55], [x + w / 2, y]];
      part(poly(pts), c, { d: 1.6, l: 1, lw: 1.6 });
      fill(ell(x, y - h * 0.3, w * 0.09, w * 0.09), gem || "#e02850");
      [x - w / 2, x, x + w / 2].forEach((gx, i) => fill(ell(gx, i === 1 ? y - h : y - h * 0.55, w * 0.06, w * 0.06), "#fff6c8"));
    }
    /* 무기들: (x,y)는 손, ang은 도 */
    function blade(x, y, len, ang, o) {
      const op = o || {};
      const col = op.col || "#c8d0dc";
      const w = op.w || 3.4;
      const tip = pol(x, y, len, ang);
      const b0 = pol(x, y, len * 0.18, ang);
      part(poly([pol(b0[0], b0[1], w / 2, ang - 90), pol(tip[0], tip[1], w * 0.2, ang - 90), tip, pol(b0[0], b0[1], w / 2, ang + 90)]), col, { d: 0.8, l: 0.8, lw: 1.4 });
      stroke([b0, pol(x, y, len * 0.85, ang)], light(col, 1.4), 0.9);
      part(tube([pol(b0[0], b0[1], w * 1.1, ang - 90), pol(b0[0], b0[1], w * 1.1, ang + 90)], 2.2), op.guard || "#8a6a2a", { d: 0.5, l: 0.3, lw: 1.2 });
      part(tube([pol(x, y, -4, ang), b0], 2.4), op.grip || "#5a3a24", { d: 0.5, l: 0.3, lw: 1.2 });
    }
    function axe(x, y, len, ang, o) {
      const op = o || {};
      const top = pol(x, y, len, ang);
      part(tube([pol(x, y, -6, ang), top], 3), op.shaft || "#7a5030", { d: 0.8, l: 0.5, lw: 1.4 });
      const hb = pol(x, y, len * 0.82, ang);
      const s = op.size || 11;
      const head = blob([pol(hb[0], hb[1], s * 0.3, ang - 90), pol(pol(hb[0], hb[1], s, ang + 90)[0], pol(hb[0], hb[1], s, ang + 90)[1], s * 0.55, ang + 180), pol(hb[0], hb[1], s * 1.05, ang + 90), pol(pol(hb[0], hb[1], s, ang + 90)[0], pol(hb[0], hb[1], s, ang + 90)[1], s * 0.55, ang), pol(hb[0], hb[1], s * 0.3, ang + 90)]);
      part(head, op.col || "#b8c0cc", { d: 1.6, l: 1, lw: 1.6 });
      if (op.double) {
        const head2 = turned(head, hb[0], hb[1], Math.PI, 1);
        part(head2, op.col || "#b8c0cc", { d: 1.6, l: 1, lw: 1.6 });
      }
    }
    function club(x, y, len, ang, o) {
      const op = o || {};
      const end = pol(x, y, len, ang);
      part(tube([pol(x, y, -4, ang), pol(x, y, len * 0.5, ang), end], [3, 5, 8]), op.col || "#8a5a30", { d: 1.6, l: 1, lw: 1.6 });
      if (op.spikes) for (let k = 0; k < 4; k++) {
        const c = pol(x, y, len * (0.6 + k * 0.12), ang);
        part(poly([pol(c[0], c[1], 3, ang + 90), pol(c[0], c[1], 6.5, ang + 80 + k * 20), pol(c[0], c[1], 2, ang + 120)]), "#d8d0c0", { d: 0, l: 0, lw: 1 });
      }
    }
    function spear(x, y, len, ang, o) {
      const op = o || {};
      const tip = pol(x, y, len, ang);
      part(tube([pol(x, y, -len * 0.3, ang), tip], 2.4), op.shaft || "#7a5030", { d: 0.6, l: 0.4, lw: 1.3 });
      const b = pol(x, y, len * 0.9, ang);
      const head = op.trident
        ? union(poly([pol(b[0], b[1], 2, ang - 90), pol(tip[0], tip[1], 5, ang), pol(b[0], b[1], 2, ang + 90)]), poly([pol(b[0], b[1], 6, ang - 90), pol(pol(b[0], b[1], 6, ang - 90)[0], pol(b[0], b[1], 6, ang - 90)[1], 9, ang), pol(b[0], b[1], 3, ang - 90)]), poly([pol(b[0], b[1], 6, ang + 90), pol(pol(b[0], b[1], 6, ang + 90)[0], pol(b[0], b[1], 6, ang + 90)[1], 9, ang), pol(b[0], b[1], 3, ang + 90)]))
        : poly([pol(b[0], b[1], 3.2, ang - 90), pol(tip[0], tip[1], 6, ang), pol(b[0], b[1], 3.2, ang + 90), pol(b[0], b[1], 2, ang + 180)]);
      part(head, op.col || "#c8d0dc", { d: 0.8, l: 0.8, lw: 1.3 });
    }
    function staff(x, y, len, ang, orb, o) {
      const op = o || {};
      const top = pol(x, y, len, ang);
      part(tube([pol(x, y, -len * 0.35, ang), top], 2.6), op.wood || "#6a4428", { d: 0.6, l: 0.4, lw: 1.3 });
      if (op.skull) {
        part(ell(top[0], top[1] - 2, 5, 4.6), "#e8e0c8", { d: 1.2, l: 0.6, lw: 1.4 });
        fill(ell(top[0] - 1.6, top[1] - 2, 1.3, 1.5), "#1a1020");
        fill(ell(top[0] + 1.8, top[1] - 2, 1.3, 1.5), "#1a1020");
        glow(top[0], top[1] - 2, 9, orb, 0.5);
        return;
      }
      part(ell(top[0], top[1] - 3, 4.4, 4.4), orb, { d: 1.2, l: 1.2, lw: 1.4 });
      fill(ell(top[0] - 1.4, top[1] - 4.6, 1.2, 1.2), "#ffffff");
      glow(top[0], top[1] - 3, 13, orb, 0.6);
      stroke([pol(top[0], top[1], 4.5, ang + 130), [top[0], top[1] + 1], pol(top[0], top[1], 4.5, ang - 130)], op.wood || "#6a4428", 1.6);
    }
    function shield(x, y, r, col, o) {
      const op = o || {};
      const p = blob([[x - r * 0.9, y - r], [x + r * 0.9, y - r], [x + r * 0.95, y + r * 0.1], [x, y + r * 1.2], [x - r * 0.95, y + r * 0.1]]);
      part(p, col, { d: 2, l: 1.2, lw: 1.8 });
      inside(p, blob([[x - r * 0.6, y - r * 0.7], [x + r * 0.6, y - r * 0.7], [x + r * 0.62, y + r * 0.05], [x, y + r * 0.8], [x - r * 0.62, y + r * 0.05]]), op.inner || dark(col, 0.8));
      if (op.boss) fill(ell(x, y - r * 0.05, r * 0.25, r * 0.25), op.boss);
    }
    return { g, u, ox, oy, px, glows, part, fill, inside, stroke, eye, glow, teeth, horn, batWing, featherWing, crown, blade, axe, club, spear, staff, shield };
  }

  /* 오른쪽을 보는 다리 하나(허벅지→무릎→발) */
  function leg(P, hip, knee, foot, w, col, o) {
    const op = o || {};
    P.part(tube([hip, knee, foot], [w, w * 0.8, w * 0.7]), col, Object.assign({ d: w * 0.3, l: w * 0.18 }, op));
    if (op.paw) P.part(ell(foot[0] + w * 0.2, foot[1] - w * 0.15, w * 0.62, w * 0.36), op.pawCol || col, { d: 1, l: 0.6, lw: 1.5 });
    if (op.claws) for (let k = 0; k < 3; k++) {
      const cx = foot[0] + w * (0.25 + k * 0.28);
      P.part(poly([[cx - 0.8, foot[1] - 0.6], [cx + 2.2, foot[1] + 0.2], [cx + 0.2, foot[1] + 0.4]]), op.claws, { d: 0, l: 0, lw: 1 });
    }
  }

  /* ─────────────────────────── 몬스터 그림 ─────────────────────────── */
  const KINDS = {};

  /* 슬라임: 젤리 몸, 반짝임, 표정. king은 왕관, snow는 눈사람 */
  KINDS.slime = (P, o) => {
    const c = o.c1;
    const s = o.size || 1;
    const cx = 50;
    const by = 95;
    const w = 40 * s;
    const h = 42 * s;
    if (o.snow) {
      P.part(ell(cx, by - h * 0.42, w * 0.95, h * 0.45), c, { d: 4, lk: 0.3 });
      P.part(ell(cx + 2, by - h * 1.02, w * 0.62, h * 0.32), c, { d: 3.4, lk: 0.3 });
      P.part(tube([[cx - w * 0.5, by - h * 0.62], [cx - w * 0.95, by - h * 0.95], [cx - w * 1.05, by - h * 1.1]], [2.4, 1.8, 1.2]), "#6a4428", { d: 0.5, l: 0.3, lw: 1.3 });
      P.part(tube([[cx + w * 0.55, by - h * 0.6], [cx + w * 0.95, by - h * 0.9], [cx + w * 1.0, by - h * 1.08]], [2.4, 1.8, 1.2]), "#6a4428", { d: 0.5, l: 0.3, lw: 1.3 });
      P.part(tube([[cx - w * 0.5, by - h * 0.78], [cx + w * 0.5, by - h * 0.76]], 6), o.c2 || "#d83a3a", { d: 1.4, l: 0.8, lw: 1.6 });
      P.part(tube([[cx + w * 0.2, by - h * 0.74], [cx + w * 0.32, by - h * 0.5]], 5), o.c2 || "#d83a3a", { d: 1.2, l: 0.6, lw: 1.5 });
      P.eye(cx - 3, by - h * 1.06, 2.6, { type: "cute" });
      P.eye(cx + 9, by - h * 1.06, 2.6, { type: "cute" });
      P.part(poly([[cx + 4, by - h * 0.98], [cx + 15, by - h * 0.94], [cx + 4, by - h * 0.9]]), "#f08a2a", { d: 0.6, l: 0.4, lw: 1.2 });
      [[cx - 4, by - h * 0.45], [cx - 2, by - h * 0.3], [cx - 1, by - h * 0.15]].forEach(([x, y]) => P.fill(ell(x, y, 1.6, 1.6), "#30283a"));
      return;
    }
    const body = blob([[cx - w, by], [cx - w * 0.96, by - h * 0.45], [cx - w * 0.55, by - h * 0.92], [cx + w * 0.05, by - h * (o.drop ? 1.18 : 1.02)], [cx + w * 0.6, by - h * 0.88], [cx + w * 0.98, by - h * 0.4], [cx + w, by]]);
    P.part(body, c, { d: 5 * s, l: 3 * s, lk: 0.8 });
    /* 속이 비치는 젤리: 안쪽 방울과 큰 반짝임 */
    P.inside(body, ell(cx - w * 0.25, by - h * 0.25, w * 0.5, h * 0.22), dark(c, 0.5));
    P.fill(ell(cx - w * 0.15, by - h * 0.55, w * 0.07, h * 0.06), light(c, 1.4));
    P.fill(ell(cx + w * 0.3, by - h * 0.28, w * 0.05, h * 0.05), light(c, 1.4));
    P.part(ell(cx - w * 0.5, by - h * 0.72, w * 0.16, h * 0.09, -0.6), "#ffffff", { flat: true, line: false });
    P.fill(ell(cx - w * 0.68, by - h * 0.5, w * 0.06, h * 0.05), "#ffffff");
    const ey = by - h * 0.5;
    if (o.sleepy) {
      P.eye(cx + w * 0.05, ey, 4 * s, { type: "closed" });
      P.eye(cx + w * 0.5, ey, 4 * s, { type: "closed" });
    } else {
      P.eye(cx + w * 0.05, ey, 4.4 * s, { type: o.angry ? "angry" : "cute" });
      P.eye(cx + w * 0.52, ey, 4.4 * s, { type: o.angry ? "angry" : "cute", iris: o.iris });
    }
    if (o.angry) P.stroke([[cx + w * 0.12, by - h * 0.25], [cx + w * 0.3, by - h * 0.32], [cx + w * 0.48, by - h * 0.25]], inkOf(c), 2);
    else P.stroke([[cx + w * 0.18, by - h * 0.3], [cx + w * 0.3, by - h * 0.24], [cx + w * 0.42, by - h * 0.3]], inkOf(c), 1.8);
    if (o.blush) {
      P.fill(ell(cx - w * 0.12, by - h * 0.36, w * 0.08, h * 0.04), "#ff8aa8");
      P.fill(ell(cx + w * 0.7, by - h * 0.36, w * 0.08, h * 0.04), "#ff8aa8");
    }
    if (o.king) {
      P.crown(cx + w * 0.08, by - h * 0.98, w * 0.6, h * 0.4, "#f4c440", "#3a8ae0");
      P.part(ell(cx + w * 0.08, by - h * 0.93, w * 0.42, h * 0.07), "#c0303a", { d: 0.8, l: 0.4, lw: 1.4 });
    }
    if (o.bubbles) [[cx + w * 0.9, by - h * 1.05, 2.6], [cx + w * 1.0, by - h * 1.3, 1.8]].forEach(([x, y, r]) => P.part(ell(x, y, r, r), light(c, 0.6), { d: 0.6, l: 0.4, lw: 1.2 }));
  };

  /* 작은 인간형(고블린·코볼트·그렘린·칼날 고블린·족장): 큰 귀, 코, 허리 천, 손에 무기 */
  KINDS.goblin = (P, o) => {
    const skin = o.c1;
    const cloth = o.c2 || "#6a4a2a";
    const big = o.big ? 1.12 : 1;
    const S = (v) => v * big;
    const hx = 52;
    const hy = 40 - (big - 1) * 30;
    /* 뒷다리·뒷팔 */
    leg(P, [44, 70], [40, 82], [38, 94], S(9), dark(skin, 0.5), { paw: true, claws: "#e8e0c8" });
    if (o.cape) P.part(blob([[38, 44], [30, 70], [28, 90], [48, 86], [56, 52]]), o.cape, { d: 3, l: 1.4 });
    P.part(tube([[44, 52], [36, 62], [32, 70]], [7, 6, 5.4]), dark(skin, 0.5), { d: 1.6 });
    /* 몸통 */
    const torso = blob([[40, 50], [56, 47], [64, 60], [62, 76], [44, 78], [36, 66]]);
    P.part(torso, skin, { d: 4 });
    P.inside(torso, ell(52, 66, 9, 7), light(skin, 0.4));
    P.part(blob([[37, 68], [63, 68], [66, 80], [58, 86], [44, 86], [35, 80]]), cloth, { d: 3 });
    P.part(tube([[37, 69], [63, 69]], 3.2), o.belt || "#3a2a1a", { d: 0.6, l: 0.4, lw: 1.4 });
    if (o.armor) P.part(blob([[41, 50], [58, 48], [63, 58], [58, 63], [43, 63], [38, 57]]), o.armor, { d: 2, l: 1.2 });
    leg(P, [56, 78], [60, 86], [58, 94], S(9.5), skin, { paw: true, claws: "#e8e0c8" });
    /* 머리: 큰 귀, 매부리코 */
    const earBack = blob([[hx - 8, hy - 2], [hx - 26 * (o.ears || 1), hy - 14], [hx - 10, hy + 6]]);
    P.part(earBack, dark(skin, 0.3), { d: 2 });
    const head = blob([[hx - 12, hy - 4], [hx - 4, hy - 14], [hx + 10, hy - 13], [hx + 16, hy - 2], [hx + 14, hy + 10], [hx + 2, hy + 14], [hx - 10, hy + 8]]);
    P.part(head, skin, { d: 4 });
    P.inside(head, ell(hx - 8, hy + 8, 6, 3), "#e07a6a");
    const ear = blob([[hx + 8, hy - 6], [hx + 30 * (o.ears || 1), hy - 18], [hx + 12, hy + 4]]);
    P.part(ear, skin, { d: 2.4 });
    P.inside(ear, blob([[hx + 11, hy - 6], [hx + 24 * (o.ears || 1), hy - 14], [hx + 13, hy + 1]]), "#d87a8a");
    P.eye(hx + 4, hy - 1, 3.6, { type: o.eyeType || "round", iris: o.iris || "#f0d020", brow: o.brow !== false });
    P.part(blob([[hx + 11, hy + 1], [hx + 20, hy + 6], [hx + 12, hy + 8]]), light(skin, 0.3), { d: 1, l: 0.6, lw: 1.5 });
    P.stroke([[hx + 1, hy + 9], [hx + 7, hy + 10], [hx + 12, hy + 9]], inkOf(skin), 1.6);
    P.teeth(hx + 3, hy + 9.2, hx + 11, hy + 9.4, 2, 2.4);
    if (o.helmet === "miner") {
      P.part(blob([[hx - 12, hy - 4], [hx - 8, hy - 16], [hx + 6, hy - 19], [hx + 17, hy - 8], [hx + 18, hy - 3]]), "#d8a830", { d: 2, l: 1.4 });
      P.part(tube([[hx - 13, hy - 3], [hx + 19, hy - 3]], 3), "#8a6a2a", { d: 0.6, l: 0.4, lw: 1.4 });
      P.part(ell(hx + 6, hy - 13, 3.4, 3.4), "#fff6b0", { d: 0.6, l: 0, lw: 1.4 });
      P.glow(hx + 6, hy - 13, 14, "#fff2a0", 0.55);
    }
    if (o.helmet === "bone") {
      P.part(blob([[hx - 12, hy - 6], [hx - 6, hy - 16], [hx + 8, hy - 17], [hx + 16, hy - 8]]), "#e8dcc0", { d: 2, l: 1 });
      [-6, 0, 6, 12].forEach((dx, k) => P.part(poly([[hx + dx - 2.6, hy - 14], [hx + dx + (k % 2 ? 1 : -1), hy - 26 - (k % 2) * 4], [hx + dx + 2.6, hy - 14]]), "#f0e6cc", { d: 0.6, l: 0.4, lw: 1.3 }));
      P.part(ell(hx + 3, hy - 13, 2.2, 2.2), "#e03a3a", { d: 0.4, l: 0, lw: 1.2 });
    }
    if (o.hood) P.part(blob([[hx - 14, hy + 6], [hx - 14, hy - 8], [hx - 2, hy - 18], [hx + 12, hy - 14], [hx + 6, hy - 8], [hx - 4, hy - 4], [hx - 6, hy + 8]]), o.hood, { d: 2.4 });
    /* 앞팔과 무기 */
    const hand = [70, 62];
    if (o.weapon === "dagger" || o.weapon === "twin") {
      P.blade(hand[0], hand[1], 18, -60, { w: 3, col: "#d0d8e0", guard: "#5a4a3a" });
      if (o.weapon === "twin") P.blade(30, 66, 16, -120, { w: 3, col: "#d0d8e0", guard: "#5a4a3a" });
    } else if (o.weapon === "pick") {
      P.part(tube([[hand[0] - 4, hand[1] + 6], [hand[0] + 6, hand[1] - 22]], 2.8), "#7a5030", { d: 0.6, l: 0.4, lw: 1.3 });
      P.part(blob([[hand[0] - 6, hand[1] - 18], [hand[0] + 6, hand[1] - 25], [hand[0] + 20, hand[1] - 17], [hand[0] + 6, hand[1] - 21]]), "#9aa4b0", { d: 1, l: 0.8, lw: 1.4 });
    } else if (o.weapon === "axe") {
      P.axe(hand[0], hand[1], 28, -75, { size: 12, double: true });
    } else if (o.weapon === "wrench") {
      P.part(tube([[hand[0] - 2, hand[1] + 4], [hand[0] + 6, hand[1] - 18]], 3.4), "#a8b0bc", { d: 0.8, l: 0.6, lw: 1.4 });
      P.part(blob([[hand[0] + 1, hand[1] - 18], [hand[0] + 6, hand[1] - 27], [hand[0] + 13, hand[1] - 22], [hand[0] + 9, hand[1] - 19], [hand[0] + 7, hand[1] - 22], [hand[0] + 6, hand[1] - 16]]), "#a8b0bc", { d: 0.8, l: 0.6, lw: 1.4 });
    } else {
      P.club(hand[0], hand[1], 24, -70, { spikes: o.spikes });
    }
    P.part(tube([[58, 52], [66, 58], hand], [7.4, 6.4, 5.6]), skin, { d: 1.6 });
    P.part(ell(hand[0], hand[1], 4.2, 4), skin, { d: 1, l: 0.6, lw: 1.5 });
    if (o.sack) P.part(blob([[26, 60], [34, 54], [40, 62], [36, 76], [24, 74]]), "#b89a6a", { d: 2.4 });
  };

  /* 쥐: 길쭉한 몸, 꼬리, 앞니 */
  KINDS.rat = (P, o) => {
    const c = o.c1;
    P.part(tube([[22, 84], [12, 76], [6, 64], [8, 52]], [5, 3.4, 2.2, 1.2]), o.c3 || "#e0a0a0", { d: 1, l: 0.5, lw: 1.4 });
    leg(P, [30, 80], [26, 88], [24, 94], 8, dark(c, 0.5), { paw: true, pawCol: "#e0a0a0" });
    leg(P, [58, 80], [56, 88], [54, 94], 7, dark(c, 0.5), { paw: true, pawCol: "#e0a0a0" });
    const body = blob([[20, 82], [26, 64], [44, 56], [62, 60], [74, 66], [76, 80], [60, 88], [34, 90]]);
    P.part(body, c, { d: 5 });
    P.inside(body, ell(48, 88, 24, 7), light(c, 0.8));
    for (let k = 0; k < 5; k++) P.stroke([[30 + k * 8, 62 + (k % 2) * 2], [33 + k * 8, 58 + (k % 2) * 2]], dark(c, 1.2), 1.3);
    leg(P, [36, 80], [32, 88], [32, 94], 8, c, { paw: true, pawCol: "#e0a0a0", claws: "#f0e8d8" });
    leg(P, [64, 80], [64, 88], [66, 94], 7, c, { paw: true, pawCol: "#e0a0a0", claws: "#f0e8d8" });
    const head = blob([[64, 62], [74, 54], [86, 60], [96, 70], [90, 76], [74, 78]]);
    P.part(head, c, { d: 3.4 });
    P.part(ell(95, 70, 2.6, 2.4), "#e07080", { d: 0.6, l: 0.4, lw: 1.3 });
    P.part(ell(70, 52, 7, 8, -0.4), c, { d: 2 });
    P.inside(ell(70, 52, 7, 8, -0.4), ell(70, 53, 4.4, 5.4, -0.4), "#e0a0a8");
    P.eye(82, 63, 2.8, { type: "glow", iris: o.iris || "#ff3a3a" });
    P.part(rrect(88.5, 75, 4.4, 5.6, 1), "#f6eed6", { d: 0, l: 0, lw: 1.2 });
    P.stroke([[92, 71], [100, 68]], "#e8e0e8", 0.8);
    P.stroke([[92, 72], [100, 73]], "#e8e0e8", 0.8);
  };

  /* 늑대류: 네 발, 갈기, 주둥이. wolfMane·crown·frost·smoke·moon 옵션 */
  KINDS.wolf = (P, o) => {
    const c = o.c1;
    const belly = o.c2 || light(c, 1.2);
    const tailPts = [[26, 62], [16, 54], [8, 50], [4, 42]];
    if (o.smoke) for (let k = 0; k < 6; k++) P.fill(ell(14 + k * 12, 92 - (k % 2) * 3, 10, 5), "rgba(40,20,70,0.55)");
    P.part(tube(tailPts, [9, 10, 8, 3]), c, { d: 2.4 });
    leg(P, [32, 72], [28, 82], [24, 94], 8, dark(c, 0.5), { paw: true, claws: "#e8e0d0" });
    leg(P, [66, 72], [70, 82], [70, 94], 8, dark(c, 0.5), { paw: true, claws: "#e8e0d0" });
    const body = blob([[24, 70], [28, 56], [48, 52], [70, 48], [80, 58], [76, 74], [56, 78], [36, 80]]);
    P.part(body, c, { d: 5 });
    P.inside(body, ell(52, 80, 20, 6), belly);
    /* 털 끝: 등 위 뾰족한 털 */
    for (let k = 0; k < 5; k++) {
      const x = 32 + k * 9;
      P.part(poly([[x - 3, 55 - k * 0.6], [x + 1, 46 - k * 0.8], [x + 4, 54 - k * 0.6]]), k % 2 ? c : dark(c, 0.4), { d: 0.6, l: 0.4, lw: 1.3 });
    }
    if (o.frost) for (let k = 0; k < 5; k++) {
      const x = 30 + k * 10;
      P.part(poly([[x - 2.6, 53 - k * 0.6], [x + 1, 38 - k * 1.2 - (k % 2) * 4], [x + 3, 52 - k * 0.6]]), k % 2 ? "#c8f4ff" : "#9ae0f8", { d: 0.6, l: 0.8, lw: 1.3 });
    }
    leg(P, [38, 74], [34, 84], [32, 94], 9, c, { paw: true, claws: "#e8e0d0" });
    leg(P, [70, 70], [76, 82], [78, 94], 9, c, { paw: true, claws: "#e8e0d0" });
    /* 목털(갈기) */
    const mane = blob([[64, 44], [76, 38], [86, 46], [84, 64], [74, 70], [64, 62]]);
    P.part(mane, o.mane || light(c, 0.5), { d: 3 });
    for (let k = 0; k < 4; k++) P.part(poly([[70 + k * 3, 64 + k], [72 + k * 3, 74 + k], [76 + k * 3, 64 + k]]), o.mane || light(c, 0.5), { d: 0.4, l: 0.3, lw: 1.2 });
    /* 머리 */
    const head = blob([[74, 40], [82, 30], [90, 32], [98, 44], [96, 52], [84, 56], [76, 52]]);
    P.part(head, c, { d: 3.4 });
    P.part(poly([[76, 36], [76, 20], [84, 30]]), c, { d: 1.2, l: 0.6, lw: 1.5 });
    P.inside(poly([[76, 36], [76, 20], [84, 30]]), poly([[77.5, 33], [77.5, 25], [81.5, 31]]), "#e0a0a8");
    P.part(poly([[84, 32], [88, 18], [92, 34]]), c, { d: 1.2, l: 0.6, lw: 1.5 });
    P.part(ell(98, 46, 3, 2.6), "#1a1420", { d: 0.4, l: 0.6, lw: 1.2 });
    P.stroke([[88, 52], [94, 52], [98, 50]], inkOf(c), 1.6);
    P.teeth(88, 52, 96, 51.4, 3, 2.6);
    if (o.scar) P.stroke([[80, 36], [88, 46]], "#e86a6a", 1.4);
    P.eye(86, 41, 3, { type: o.glowEye ? "glow" : "slit", iris: o.iris || "#f0c030", brow: !o.glowEye });
    if (o.crown) P.crown(84, 31, 13, 9, o.crown, "#5a9ae8");
    if (o.moon) {
      P.part(blob([[60, 40], [58, 30], [64, 24], [62, 32], [66, 38]]), "#f8f0b8", { d: 0.6, l: 0.4, lw: 1.3 });
      P.glow(62, 32, 14, "#fff2b0", 0.5);
    }
  };

  /* 박쥐: 날개를 활짝, 큰 귀와 송곳니 */
  KINDS.bat = (P, o) => {
    const c = o.c1;
    P.batWing(48, 52, 46, -150, c, o.c2, {});
    P.batWing(54, 52, 46, -30, c, o.c2, {});
    const body = blob([[44, 50], [50, 40], [58, 42], [62, 54], [56, 68], [48, 68], [42, 60]]);
    P.part(body, c, { d: 3.4 });
    P.inside(body, ell(52, 60, 5, 6), light(c, 0.6));
    P.part(poly([[44, 44], [40, 26], [50, 38]]), c, { d: 1, l: 0.6, lw: 1.5 });
    P.part(poly([[56, 40], [62, 24], [62, 42]]), c, { d: 1, l: 0.6, lw: 1.5 });
    P.inside(poly([[56, 40], [62, 24], [62, 42]]), poly([[58, 39], [61.4, 29], [61.2, 40]]), "#e0909a");
    P.eye(48, 47, 2.6, { type: "glow", iris: o.iris || "#ff4040" });
    P.eye(57, 47, 2.6, { type: "glow", iris: o.iris || "#ff4040" });
    P.stroke([[48, 54], [53, 56], [58, 54]], inkOf(c), 1.6);
    P.teeth(49.5, 54.8, 51.5, 55.6, 1, 3);
    P.teeth(54.5, 55.6, 56.5, 54.8, 1, 3);
    P.part(tube([[48, 66], [46, 74]], 2), dark(c, 0.4), { d: 0.4, l: 0.2, lw: 1.2 });
    P.part(tube([[56, 66], [58, 74]], 2), dark(c, 0.4), { d: 0.4, l: 0.2, lw: 1.2 });
    if (o.blood) [[30, 72], [70, 76], [50, 84]].forEach(([x, y]) => P.part(blob([[x, y - 3], [x + 1.6, y + 1], [x, y + 2.6], [x - 1.6, y + 1]]), "#c81830", { d: 0.4, l: 0.4, lw: 1 }));
  };

  /* 버섯 괴물: 점박이 갓, 몸통 얼굴, 팔. sleepy는 수면 모자와 감은 눈 */
  KINDS.mushroom = (P, o) => {
    const cap = o.c1;
    const stem = o.c2 || "#f0dcb0";
    leg(P, [42, 84], [40, 90], [38, 95], 8, dark(stem, 0.4), { paw: true });
    leg(P, [58, 84], [60, 90], [62, 95], 8, stem, { paw: true });
    const body = blob([[34, 56], [66, 56], [70, 74], [62, 88], [38, 88], [30, 74]]);
    P.part(body, stem, { d: 4 });
    P.part(tube([[34, 66], [24, 74], [22, 80]], [6, 5, 4.6]), dark(stem, 0.3), { d: 1 });
    P.part(tube([[66, 66], [76, 72], [80, 78]], [6, 5, 4.6]), stem, { d: 1 });
    const capP = blob([[14, 58], [20, 40], [36, 26], [52, 22], [70, 28], [84, 42], [88, 58], [70, 62], [50, 60], [30, 62]]);
    P.part(capP, cap, { d: 5, l: 2.4 });
    [[30, 38, 5], [48, 30, 4], [64, 36, 5.6], [78, 50, 3.4], [22, 52, 3.2], [44, 46, 3]].forEach(([x, y, r]) => P.inside(capP, ell(x, y, r, r * 0.85), o.c3 || "#fff4e8", { part: true, d: 0.8, l: 0.4 }));
    if (o.sleepy) {
      P.part(blob([[30, 30], [50, 22], [72, 28], [86, 12], [92, 8], [82, 24], [74, 36], [40, 34]]), "#6a7ad8", { d: 2 });
      P.part(ell(93, 8, 3.6, 3.6), "#ffffff", { d: 0.6, l: 0, lw: 1.3 });
      P.eye(42, 70, 4, { type: "closed" });
      P.eye(58, 70, 4, { type: "closed" });
      P.fill(ell(50, 80, 2.6, 2), "#9a5a5a");
      P.fill(ell(36, 76, 3.4, 2), "#f4a0b0");
      P.fill(ell(64, 76, 3.4, 2), "#f4a0b0");
    } else {
      P.eye(42, 70, 4, { type: "angry", iris: o.iris || "#e83a3a" });
      P.eye(58, 70, 4, { type: "angry", iris: o.iris || "#e83a3a" });
      P.stroke([[42, 81], [50, 78], [58, 81]], inkOf(stem), 1.8);
      P.teeth(44, 80, 56, 80, 3, 2.4);
    }
    if (o.spores) [[18, 30], [86, 26], [10, 46], [92, 40]].forEach(([x, y]) => { P.fill(ell(x, y, 1.8, 1.8), "#c8f070"); P.glow(x, y, 6, "#c8f070", 0.4); });
  };

  /* 해골: 병사(검·방패·투구) 또는 마법사(두건 로브·지팡이) */
  KINDS.skeleton = (P, o) => {
    const bone = o.c1 || "#e8e0c8";
    const mage = o.mage;
    if (mage) {
      P.part(blob([[30, 46], [56, 42], [66, 60], [70, 94], [26, 94], [30, 64]]), o.c2 || "#2a3a6a", { d: 5 });
      P.inside(blob([[30, 46], [56, 42], [66, 60], [70, 94], [26, 94], [30, 64]]), poly([[46, 46], [52, 46], [56, 94], [42, 94]]), dark(o.c2 || "#2a3a6a", 0.8));
      P.part(tube([[62, 92], [66, 96]], 4), bone, { d: 0.6 });
    } else {
      /* 다리뼈 */
      [[42, 70, 38, 82, 36, 94], [56, 70, 60, 82, 60, 94]].forEach(([a, b, c2, d2, e, f], k) => {
        P.part(tube([[a, b], [c2, d2]], 3.4), k ? bone : dark(bone, 0.5), { d: 0.8, l: 0.4, lw: 1.5 });
        P.part(tube([[c2, d2], [e, f]], 3), k ? bone : dark(bone, 0.5), { d: 0.8, l: 0.4, lw: 1.5 });
        P.part(ell(c2, d2, 3, 2.6), k ? bone : dark(bone, 0.5), { d: 0.6, l: 0.3, lw: 1.4 });
        P.part(ell(e + 3, f - 1, 5, 2.4), k ? bone : dark(bone, 0.5), { d: 0.6, l: 0.3, lw: 1.4 });
      });
      P.part(ell(49, 68, 9, 4), bone, { d: 1.2 });
      P.part(tube([[48, 46], [49, 66]], 3.4), bone, { d: 0.8 });
      /* 갈비뼈 */
      for (let k = 0; k < 4; k++) P.part(tube([[40 + k * 0.6, 48 + k * 4], [49, 50 + k * 4.4], [58 - k * 0.6, 48 + k * 4]], 2.6), bone, { d: 0.6, l: 0.3, lw: 1.4 });
      P.part(tube([[38, 46], [60, 46]], 3.6), bone, { d: 0.8 });
      P.part(tube([[38, 47], [32, 58], [30, 68]], 3), dark(bone, 0.4), { d: 0.6, lw: 1.4 });
      P.shield(26, 64, 10, o.c2 || "#6a4a3a", { inner: "#8a6a4a", boss: "#c8a040" });
    }
    /* 두개골 */
    const sk = blob([[40, 30], [44, 18], [56, 16], [64, 24], [64, 34], [58, 40], [46, 40]]);
    P.part(sk, bone, { d: 3 });
    P.part(rrect(48, 36, 13, 7, 2), bone, { d: 1, l: 0.4, lw: 1.5 });
    for (let k = 0; k < 4; k++) P.stroke([[50 + k * 3, 37], [50 + k * 3, 42]], inkOf(bone), 1);
    P.fill(ell(52, 28, 4, 4.4), "#1a1020");
    P.fill(ell(61, 28, 3.4, 4), "#1a1020");
    P.fill(poly([[57, 33], [55.6, 36], [58.4, 36]]), "#1a1020");
    P.eye(52, 28, 1.6, { type: "glow", iris: o.iris || "#60e0ff" });
    P.eye(61, 28, 1.4, { type: "glow", iris: o.iris || "#60e0ff" });
    if (mage) {
      P.part(blob([[36, 40], [36, 22], [48, 8], [62, 10], [70, 22], [66, 28], [58, 16], [44, 22], [42, 40]]), o.c2 || "#2a3a6a", { d: 3 });
      P.staff(72, 66, 40, -86, o.orb || "#60e0ff", {});
      P.part(tube([[56, 48], [66, 58], [72, 66]], [5, 4.4, 4]), o.c2 || "#2a3a6a", { d: 1 });
      P.part(ell(72, 66, 3, 3), bone, { d: 0.6, lw: 1.3 });
    } else {
      P.part(blob([[38, 24], [44, 12], [58, 10], [66, 20], [64, 22], [40, 26]]), o.helm || "#7a8290", { d: 2 });
      P.part(tube([[60, 47], [66, 56], [70, 62]], 3), bone, { d: 0.6, lw: 1.4 });
      P.blade(70, 62, 30, -62, { w: 4, col: "#b8c0c8" });
      P.part(ell(70, 62, 2.6, 2.6), bone, { d: 0.4, lw: 1.3 });
    }
  };

  /* 멧돼지: 등의 갈기, 엄니 */
  KINDS.boar = (P, o) => {
    const c = o.c1;
    leg(P, [28, 74], [26, 84], [24, 94], 8, dark(c, 0.5), { paw: true, pawCol: "#3a2a24" });
    leg(P, [62, 74], [64, 84], [62, 94], 8, dark(c, 0.5), { paw: true, pawCol: "#3a2a24" });
    P.part(tube([[18, 62], [10, 58], [8, 52]], [3, 2, 1.4]), c, { d: 0.6, l: 0.3, lw: 1.3 });
    const body = blob([[16, 66], [24, 50], [46, 42], [68, 44], [82, 54], [80, 72], [60, 80], [28, 80]]);
    P.part(body, c, { d: 6 });
    P.inside(body, ell(48, 82, 26, 6), o.c2 || light(c, 0.6));
    for (let k = 0; k < 7; k++) {
      const x = 26 + k * 7;
      P.part(poly([[x - 3.4, 48 - Math.sin(k / 6 * 3.1) * 4], [x + 1, 36 - Math.sin(k / 6 * 3.1) * 6], [x + 3.4, 47 - Math.sin(k / 6 * 3.1) * 4]]), dark(c, 0.8), { d: 0.6, l: 0.4, lw: 1.3 });
    }
    leg(P, [34, 76], [32, 86], [32, 94], 9, c, { paw: true, pawCol: "#3a2a24" });
    leg(P, [70, 74], [72, 84], [72, 94], 9, c, { paw: true, pawCol: "#3a2a24" });
    const head = blob([[70, 44], [82, 40], [94, 52], [98, 64], [90, 72], [76, 70], [70, 58]]);
    P.part(head, c, { d: 4 });
    P.part(rrect(91, 58, 8, 9, 3), o.c3 || "#e8a090", { d: 1, l: 0.6, lw: 1.5 });
    P.fill(ell(94, 62, 0.9, 1.4), "#4a2a2a");
    P.fill(ell(97, 62, 0.9, 1.4), "#4a2a2a");
    P.part(poly([[74, 42], [72, 30], [80, 40]]), c, { d: 0.8, l: 0.4, lw: 1.4 });
    P.part(tube([[88, 68], [94, 64], [96, 56]], [3, 2.4, 1]), "#f6eed6", { d: 0.6, l: 0.4, lw: 1.3 });
    P.eye(84, 52, 2.6, { type: "angry", iris: o.iris || "#e83a3a" });
    if (o.steam) [[100, 58], [100, 66]].forEach(([x, y]) => P.fill(ell(x, y, 3, 2), "rgba(240,240,255,0.7)"));
  };

  /* 산적: 두건과 복면, 단검, 망토 */
  KINDS.bandit = (P, o) => {
    const cloth = o.c1;
    const skin = o.skin || "#e8b890";
    P.part(blob([[34, 40], [28, 70], [30, 92], [50, 86], [58, 48]]), o.c2 || "#5a3a2a", { d: 3 });
    leg(P, [44, 70], [42, 82], [40, 94], 9, dark(o.pants || "#3a3a4a", 0.4), { paw: true, pawCol: "#3a2a1a" });
    leg(P, [56, 70], [58, 82], [60, 94], 9, o.pants || "#3a3a4a", { paw: true, pawCol: "#3a2a1a" });
    const torso = blob([[38, 44], [60, 42], [66, 58], [62, 74], [40, 74], [36, 58]]);
    P.part(torso, cloth, { d: 4 });
    P.part(tube([[38, 66], [64, 64]], 4), "#3a2a1a", { d: 0.6, l: 0.4, lw: 1.4 });
    P.part(rrect(52, 62, 5, 5, 1), "#c8a040", { d: 0.4, l: 0.2, lw: 1.2 });
    P.part(tube([[60, 46], [68, 54], [74, 56]], [7, 6, 5]), cloth, { d: 1.4 });
    P.blade(76, 56, 18, -40, { w: 3.2, col: "#d8dce4" });
    P.part(ell(75, 56, 3.6, 3.4), skin, { d: 0.6, lw: 1.4 });
    const head = blob([[42, 34], [44, 20], [56, 16], [66, 24], [66, 36], [58, 42], [46, 42]]);
    P.part(head, skin, { d: 3 });
    P.part(blob([[42, 36], [40, 22], [50, 12], [62, 12], [70, 22], [68, 30], [60, 22], [48, 26], [46, 40]]), o.c2 || "#5a3a2a", { d: 2.4 });
    P.part(blob([[48, 31], [68, 30], [68, 38], [58, 43], [48, 40]]), o.mask || "#2a2a34", { d: 1.2, l: 0.6 });
    P.eye(60, 27, 2.6, { type: "angry", iris: "#4a3a2a" });
    if (o.scar) P.stroke([[54, 21], [58, 30]], "#c86a5a", 1.2);
  };

  /* 토끼: 털 뭉치, 긴 귀, 보송한 꼬리 */
  KINDS.rabbit = (P, o) => {
    const c = o.c1;
    P.part(ell(24, 78, 8, 7), "#ffffff", { d: 1.6 });
    const body = blob([[24, 86], [28, 66], [46, 56], [64, 62], [72, 80], [62, 94], [34, 94]]);
    P.part(body, c, { d: 5 });
    P.inside(body, ell(56, 84, 12, 10), "#ffffff");
    for (let k = 0; k < 6; k++) P.part(ell(30 + k * 7, 62 + Math.sin(k) * 2, 4.4, 3.4), c, { d: 1, l: 0.6, line: false });
    P.part(ell(64, 92, 8, 4), c, { d: 1.2 });
    const head = ell(64, 50, 15, 13);
    P.part(head, c, { d: 3.6 });
    [[54, 34, 52, 12, -0.2], [66, 34, 70, 10, 0.25]].forEach(([x1, y1, x2, y2], k) => {
      const ear = tube([[x1, y1], [(x1 + x2) / 2, (y1 + y2) / 2], [x2, y2]], [8, 9, 6]);
      P.part(ear, k ? c : dark(c, 0.3), { d: 1.6 });
      P.inside(ear, tube([[x1, y1 - 2], [x2, y2 + 3]], [3.4, 3]), o.c2 || "#f8a8c0");
    });
    P.eye(64, 48, 3.6, { type: "cute" });
    P.eye(74, 48, 3, { type: "cute" });
    P.part(ell(76, 54, 2, 1.6), "#f07898", { d: 0.4, l: 0, lw: 1.2 });
    P.stroke([[73, 57], [76, 59], [79, 57]], inkOf(c), 1.2);
    P.fill(ell(58, 56, 3.4, 1.8), "#ffb0c8");
    P.fill(ell(80, 54, 2.4, 1.6), "#ffb0c8");
  };

  /* 임프(작은 악마): 뿔, 박쥐 날개, 꼬리. stinger(독침)·fire(불꽃)·duke(왕관·망토·삼지창) */
  KINDS.imp = (P, o) => {
    const c = o.c1;
    const duke = o.duke;
    P.batWing(42, 48, duke ? 40 : 30, -140, o.c2 || dark(c, 0.6), o.c3 || dark(c, 1.2), {});
    if (duke) P.part(blob([[36, 44], [56, 42], [62, 70], [58, 94], [24, 94], [28, 70]]), o.cape || "#5a0a1a", { d: 4 });
    const tail = tube([[38, 74], [26, 80], [18, 72], [16, 60]], [4, 3, 2.4, 1.6]);
    P.part(tail, c, { d: 1 });
    if (o.stinger) {
      P.part(poly([[12, 58], [16, 48], [21, 58], [16, 62]]), "#a8f040", { d: 0.8, l: 0.6, lw: 1.4 });
      P.glow(16, 54, 8, "#a8f040", 0.5);
    } else P.part(poly([[11, 62], [16, 50], [21, 62]]), dark(c, 0.6), { d: 0.6, l: 0.4, lw: 1.4 });
    leg(P, [44, 74], [38, 84], [40, 94], 7, dark(c, 0.5), { paw: true, claws: "#e8e0d0" });
    leg(P, [54, 74], [60, 84], [58, 94], 7, c, { paw: true, claws: "#e8e0d0" });
    const body = blob([[40, 54], [56, 50], [62, 62], [58, 78], [42, 78], [36, 66]]);
    P.part(body, c, { d: 4 });
    P.inside(body, ell(50, 70, 7, 6), light(c, 0.6));
    const head = blob([[38, 40], [44, 26], [58, 24], [68, 32], [68, 44], [60, 52], [44, 52]]);
    P.part(head, c, { d: 3.6 });
    P.horn(46, 28, 14, -120, 30, 5, o.horn || "#f0e0c0", { rings: true });
    P.horn(60, 27, 14, -70, -30, 5, o.horn || "#f0e0c0", { rings: true });
    P.eye(56, 38, 3.4, { type: "angry", iris: o.iris || "#ffd030" });
    P.part(blob([[52, 45], [66, 43], [62, 49], [56, 50]]), "#3a1020", { d: 0.4, l: 0, lw: 1.4 });
    P.teeth(54, 45.4, 64, 44, 3, 2.2);
    P.part(ell(68, 38, 3, 2.2), c, { d: 0.6, lw: 1.3 });
    if (duke) {
      P.crown(52, 26, 16, 10, "#f0c040", "#e02850");
      P.spear(70, 66, 44, -84, { trident: true, col: "#f0c040", shaft: "#3a1a1a" });
    } else {
      P.spear(68, 66, 30, -70, { trident: true, col: o.fork || "#c8ccd4", shaft: "#4a2a20" });
    }
    P.part(tube([[58, 56], [64, 62], [68, 66]], [5.4, 5, 4.4]), c, { d: 1 });
    P.part(ell(68, 66, 3.2, 3), c, { d: 0.6, lw: 1.3 });
    if (o.fire) {
      [[40, 22], [54, 18], [64, 22]].forEach(([x, y], k) => P.part(blob([[x - 3, y + 4], [x, y - 6 - k], [x + 3, y + 4]]), k % 2 ? "#ffd040" : "#ff6a20", { d: 0.6, l: 0.6, lw: 1.2 }));
      P.glow(52, 30, 26, "#ff6a20", 0.35);
    }
  };

  /* 고목왕(나무 정령): 거대한 줄기 몸, 나뭇잎 왕관, 껍질 얼굴, 가지 팔 */
  KINDS.treant = (P, o) => {
    const bark = o.c1;
    const leaf = o.c2 || "#3a8a3a";
    const king = o.king;
    /* 뿌리 */
    [[30, 94, 14, 84], [46, 96, 40, 84], [66, 96, 64, 84], [80, 94, 74, 82]].forEach(([x1, y1, x2, y2], k) => P.part(tube([[x2, y2], [(x1 + x2) / 2 + (k % 2 ? 3 : -3), (y1 + y2) / 2], [x1, y1]], [8, 6, 3]), k % 2 ? bark : dark(bark, 0.4), { d: 1 }));
    /* 뒤 가지 팔 */
    P.part(tube([[34, 52], [20, 44], [12, 30]], [9, 7, 4]), dark(bark, 0.5), { d: 2 });
    P.part(tube([[18, 42], [8, 44]], [4, 2]), dark(bark, 0.5), { d: 0.6 });
    const trunk = blob([[32, 92], [30, 60], [36, 36], [50, 28], [66, 34], [72, 60], [70, 92]]);
    P.part(trunk, bark, { d: 6, l: 2 });
    /* 껍질 결 */
    [[38, 40, 36, 88], [46, 34, 48, 90], [60, 36, 62, 88], [67, 50, 66, 86]].forEach(([x1, y1, x2, y2]) => P.stroke([[x1, y1], [(x1 + x2) / 2 + 2, (y1 + y2) / 2], [x2, y2]], dark(bark, 1.1), 1.4));
    /* 이끼 */
    P.inside(trunk, blob([[30, 70], [40, 64], [52, 68], [60, 62], [74, 66], [74, 74], [30, 78]]), o.moss || "#5a9a3a", { part: true, d: 1, l: 0.6 });
    /* 얼굴: 움푹 패인 눈과 입 */
    P.part(ell(44, 52, 5, 4), "#1a1008", { d: 0, l: 0, lw: 1.6 });
    P.part(ell(60, 52, 5, 4), "#1a1008", { d: 0, l: 0, lw: 1.6 });
    P.eye(44, 52, 2.8, { type: "glow", iris: o.iris || "#ffe040" });
    P.eye(60, 52, 2.8, { type: "glow", iris: o.iris || "#ffe040" });
    P.stroke([[38, 46], [48, 49]], dark(bark, 1.3), 2.4);
    P.stroke([[66, 46], [56, 49]], dark(bark, 1.3), 2.4);
    P.part(blob([[42, 62], [52, 60], [62, 63], [58, 70], [46, 70]]), "#1a1008", { d: 0, l: 0, lw: 1.6 });
    P.teeth(44, 63, 60, 63.4, 4, 2.4, "#c8b890");
    /* 앞 가지 팔 */
    P.part(tube([[68, 50], [80, 42], [88, 28]], [9, 7, 4]), bark, { d: 2 });
    P.part(tube([[82, 40], [92, 40]], [4, 2]), bark, { d: 0.6 });
    P.part(tube([[86, 32], [94, 24]], [3, 1.6]), bark, { d: 0.6 });
    /* 잎 왕관 */
    const crownLeaves = [[50, 18, 22, 13], [32, 26, 13, 10], [68, 24, 14, 10], [14, 28, 8, 6], [88, 24, 8, 6], [50, 8, 12, 8]];
    crownLeaves.forEach(([x, y, rx, ry], k) => P.part(blob([[x - rx, y + ry * 0.4], [x - rx * 0.6, y - ry * 0.7], [x, y - ry], [x + rx * 0.7, y - ry * 0.6], [x + rx, y + ry * 0.3], [x + rx * 0.3, y + ry], [x - rx * 0.4, y + ry * 0.9]]), k % 2 ? leaf : light(leaf, 0.4), { d: 3, l: 1.6 }));
    if (king) {
      [[44, 14], [58, 10], [36, 26], [72, 22], [50, 2]].forEach(([x, y], k) => { P.part(ell(x, y, 2.2, 2.2), k % 2 ? "#ffd040" : "#ff6a8a", { d: 0.4, l: 0.4, lw: 1.1 }); });
      P.glow(50, 52, 30, "#c8ff60", 0.25);
    }
  };

  /* 덩치 큰 인간형(오크·트롤·오우거·미노타우로스·거인): 머리 모양과 무기·갑옷·속성 효과가 다르다 */
  const BRUTE_HEAD = {
    orc(P, x, y, c, o) {
      P.part(poly([[x - 12, y - 2], [x - 22, y - 10], [x - 12, y + 6]]), dark(c, 0.3), { d: 1.4 });
      const h = blob([[x - 12, y - 6], [x - 4, y - 14], [x + 10, y - 13], [x + 15, y - 2], [x + 16, y + 10], [x + 4, y + 16], [x - 10, y + 12]]);
      P.part(h, c, { d: 3.4 });
      P.part(blob([[x - 10, y - 10], [x - 2, y - 20], [x + 6, y - 22], [x + 8, y - 14], [x, y - 12]]), o.hair || "#2a2028", { d: 1.6 });
      P.eye(x + 6, y - 3, 3, { type: "angry", iris: o.iris || "#ffd040", squint: true });
      P.part(ell(x + 13, y + 3, 3.4, 2.6), dark(c, 0.3), { d: 0.6, l: 0.4, lw: 1.4 });
      P.stroke([[x + 2, y + 10], [x + 9, y + 11], [x + 15, y + 9]], inkOf(c), 1.8);
      P.part(tube([[x + 4, y + 11], [x + 3, y + 4]], [3, 1]), "#f4ecd0", { d: 0.4, l: 0.3, lw: 1.2 });
      P.part(tube([[x + 12, y + 10], [x + 13, y + 3.5]], [3, 1]), "#f4ecd0", { d: 0.4, l: 0.3, lw: 1.2 });
    },
    troll(P, x, y, c, o) {
      P.part(blob([[x - 14, y - 4], [x - 26, y - 2], [x - 14, y + 6]]), dark(c, 0.3), { d: 1.4 });
      const h = blob([[x - 12, y - 4], [x - 6, y - 14], [x + 8, y - 14], [x + 14, y - 4], [x + 12, y + 12], [x, y + 16], [x - 10, y + 10]]);
      P.part(h, c, { d: 3.4 });
      P.part(blob([[x - 14, y + 6], [x - 16, y - 8], [x - 4, y - 18], [x + 10, y - 16], [x + 4, y - 10], [x - 6, y - 8], [x - 8, y + 10]]), o.hair || "#4a6a3a", { d: 2 });
      P.part(tube([[x + 8, y - 2], [x + 18, y + 4], [x + 20, y + 10]], [6, 5, 4]), light(c, 0.2), { d: 1.4, l: 0.6 });
      P.eye(x + 5, y - 4, 2.8, { type: "round", iris: o.iris || "#e0e040", brow: true });
      P.stroke([[x, y + 11], [x + 10, y + 12]], inkOf(c), 1.8);
      P.teeth(x + 1, y + 10.6, x + 9, y + 11.4, 2, -2.4);
    },
    ogre(P, x, y, c, o) {
      const h = blob([[x - 14, y - 2], [x - 8, y - 14], [x + 8, y - 15], [x + 16, y - 4], [x + 17, y + 10], [x + 4, y + 18], [x - 12, y + 12]]);
      P.part(h, c, { d: 4 });
      P.part(ell(x - 13, y + 1, 4, 5), dark(c, 0.3), { d: 1 });
      P.part(blob([[x - 2, y - 13], [x + 2, y - 22], [x + 6, y - 13]]), o.hair || "#4a3020", { d: 0.8 });
      P.eye(x + 8, y - 4, 3.4, { type: "angry", iris: o.iris || "#ff6a30" });
      P.part(blob([[x + 13, y - 2], [x + 20, y + 3], [x + 14, y + 6]]), light(c, 0.2), { d: 0.8, l: 0.4, lw: 1.5 });
      P.part(blob([[x - 2, y + 9], [x + 15, y + 8], [x + 12, y + 15], [x + 2, y + 15]]), "#4a1a20", { d: 0, l: 0, lw: 1.6 });
      P.teeth(x, y + 9.2, x + 14, y + 8.4, 4, 2.6);
    },
    bull(P, x, y, c, o) {
      const hornCol = o.horn || "#f0e4c4";
      P.horn(x - 8, y - 10, o.boss ? 22 : 17, -150, 70, 6, hornCol, { rings: true });
      P.part(ell(x - 12, y, 6, 3.4, 0.4), dark(c, 0.3), { d: 1 });
      const h = blob([[x - 10, y - 8], [x, y - 14], [x + 10, y - 10], [x + 20, y], [x + 22, y + 10], [x + 12, y + 16], [x - 4, y + 12], [x - 10, y + 4]]);
      P.part(h, c, { d: 3.4 });
      P.part(blob([[x + 12, y + 2], [x + 23, y + 4], [x + 24, y + 13], [x + 12, y + 15]]), o.muzzle || light(c, 0.6), { d: 1.4, l: 0.6, lw: 1.6 });
      P.fill(ell(x + 19, y + 7, 1.2, 1.8), "#2a1a1a");
      P.fill(ell(x + 22.5, y + 7, 1, 1.6), "#2a1a1a");
      P.part(tube([[x + 19, y + 11], [x + 21, y + 14], [x + 23, y + 11]], 1.8), "#f0c040", { d: 0.3, l: 0.3, lw: 1 });
      P.eye(x + 6, y - 3, 2.8, { type: "angry", iris: o.iris || "#ff3a2a" });
      P.horn(x + 2, y - 12, o.boss ? 24 : 18, -60, -60, 6.4, hornCol, { rings: true });
      P.part(ell(x + 10, y - 7, 3, 2, -0.6), dark(c, 0.3), { d: 0.6 });
    },
    giant(P, x, y, c, o) {
      const el = o.element;
      const hairCol = o.hair || (el === "fire" ? "#ff7a20" : el === "ice" ? "#e8f8ff" : el === "storm" ? "#2a3a6a" : "#5a3a20");
      /* 머리카락(뒤): 불꽃 · 얼음 · 먹구름 */
      if (el === "fire") {
        [[x - 14, y - 4, 22], [x - 6, y - 12, 26], [x + 4, y - 14, 22], [x - 18, y + 6, 16], [x + 12, y - 8, 14]].forEach(([fx, fy, s2], k) => {
          P.part(blob([[fx - 7, fy + 6], [fx - 3, fy - s2 * 0.6], [fx + 1, fy - s2], [fx + 5, fy - s2 * 0.4], [fx + 7, fy + 6]]), k % 2 ? "#ffd040" : "#ff6a1a", { d: 1.6, l: 1, lw: 1.5 });
        });
        P.glow(x - 2, y - 14, 28, "#ff8a2a", 0.45);
      } else {
        P.part(blob([[x - 18, y + 12], [x - 20, y - 6], [x - 8, y - 20], [x + 8, y - 20], [x + 14, y - 10], [x + 2, y - 12], [x - 8, y - 6], [x - 10, y + 14]]), hairCol, { d: 2.4 });
        if (el === "ice") [[x - 16, y - 8], [x - 8, y - 18], [x + 4, y - 20]].forEach(([ix, iy], k) => P.part(poly([[ix - 3, iy + 4], [ix - 1, iy - 9 - k * 2], [ix + 3, iy + 4]]), "#c8f0ff", { d: 0.6, l: 0.8, lw: 1.2 }));
        if (el === "storm") {
          P.stroke([[x - 18, y - 16], [x - 12, y - 8], [x - 16, y - 2], [x - 8, y + 6]], "#fff8a0", 1.8);
          P.glow(x - 12, y - 6, 18, "#a0e0ff", 0.45);
        }
      }
      const h = blob([[x - 11, y - 6], [x - 4, y - 15], [x + 9, y - 15], [x + 16, y - 4], [x + 16, y + 8], [x + 6, y + 14], [x - 8, y + 10]]);
      P.part(h, c, { d: 3.4 });
      /* 짙은 눈썹, 빛나는 눈, 코 */
      P.stroke([[x + 1, y - 9], [x + 12, y - 7]], inkOf(c), 2.6);
      P.eye(x + 7, y - 3, 3, { type: el ? "glow" : "angry", iris: o.iris || (el === "fire" ? "#ffe040" : el === "ice" ? "#40d8ff" : el === "storm" ? "#a0f0ff" : "#4a6aa0") });
      P.part(blob([[x + 13, y - 3], [x + 20, y + 3], [x + 14, y + 5]]), light(c, 0.3), { d: 0.6, l: 0.4, lw: 1.4 });
      /* 수염: 입 아래로만 */
      const beardCol = el === "fire" ? "#ff8a20" : hairCol;
      P.part(blob([[x - 4, y + 8], [x + 16, y + 6], [x + 15, y + 14], [x + 8, y + 24], [x + 3, y + 26], [x, y + 16]]), beardCol, { d: 2.4, l: 1.2 });
      P.part(blob([[x + 5, y + 7], [x + 14, y + 6], [x + 12, y + 10], [x + 6, y + 10]]), "#3a1a1a", { d: 0, l: 0, lw: 1.3 });
      if (el === "ice") for (let k = 0; k < 3; k++) P.part(poly([[x + 2 + k * 4, y + 20], [x + 4 + k * 4, y + 30], [x + 6 + k * 4, y + 20]]), "#c8f0ff", { d: 0.4, l: 0.6, lw: 1.1 });
      if (o.crownCol) P.crown(x + 2, y - 14, 18, 10, o.crownCol, "#40a0ff");
    }
  };
  KINDS.brute = (P, o) => {
    const skin = o.c1;
    const cloth = o.c2 || "#6a4a2a";
    const metal = o.metal || "#8a929e";
    const boots = o.boots || "#3a2a20";
    const fat = o.fat ? 1 : 0;
    if (o.cape) P.part(blob([[30, 32], [20, 60], [18, 94], [44, 90], [52, 40]]), o.cape, { d: 4, l: 1.6 });
    leg(P, [42, 70], [38, 82], [36, 94], 13, dark(o.pants || skin, 0.5), { paw: true, pawCol: boots });
    /* 뒷팔 */
    P.part(tube([[38, 38], [28, 50], [24, 62]], [12, 11, 10]), dark(skin, 0.5), { d: 2 });
    P.part(ell(23, 65, 6.4, 6), dark(skin, 0.5), { d: 1.2 });
    const torso = blob([[32, 38], [48, 28], [66, 32], [76, 48], [72 + fat * 4, 66], [52, 76], [34, 70], [28, 54]]);
    P.part(torso, skin, { d: 6, l: 2 });
    if (fat) P.inside(torso, ell(56, 62, 18, 13), light(skin, 0.5), { part: true, d: 2, l: 1 });
    else {
      P.stroke([[44, 44], [52, 48], [62, 44]], dark(skin, 1.1), 1.6);
      P.stroke([[52, 52], [52, 64]], dark(skin, 0.9), 1.2);
    }
    if (o.scar) P.stroke([[40, 40], [50, 54]], "#d07a6a", 1.4);
    P.part(blob([[32, 66], [72, 64], [76, 80], [62, 86], [40, 86], [30, 80]]), cloth, { d: 3 });
    P.part(tube([[32, 67], [72, 65]], 4.6), o.belt || "#3a2a1a", { d: 0.8, l: 0.5, lw: 1.5 });
    P.part(ell(54, 66, 4, 3.6), o.buckle || "#c8a040", { d: 0.6, l: 0.4, lw: 1.3 });
    leg(P, [58, 74], [62, 84], [62, 94], 13, o.pants || skin, { paw: true, pawCol: boots });
    if (o.armor) {
      P.part(blob([[56, 30], [74, 28], [82, 38], [76, 46], [60, 42]]), metal, { d: 2.4, l: 1.4 });
      [[64, 34], [72, 34]].forEach(([x, y]) => P.fill(ell(x, y, 1.2, 1.2), light(metal, 1.2)));
      if (o.armor === "spiked") P.part(poly([[68, 30], [72, 20], [76, 31]]), light(metal, 0.6), { d: 0.6, l: 0.4, lw: 1.3 });
    }
    if (o.element === "ice") [[40, 30], [32, 36], [70, 28]].forEach(([x, y], k) => P.part(poly([[x - 3, y + 2], [x, y - 10 - k * 2], [x + 3, y + 2]]), "#c8f0ff", { d: 0.6, l: 0.8, lw: 1.2 }));
    if (o.element === "fire") P.glow(52, 50, 34, "#ff6a20", 0.25);
    /* 앞팔과 무기 */
    const hand = [80, 58];
    const w = o.weapon || "axe";
    if (w === "axe") P.axe(hand[0], hand[1], 36, -78, { size: 12, col: metal });
    else if (w === "greataxe") P.axe(hand[0], hand[1], 44, -80, { size: 15, double: true, col: metal, shaft: "#4a2a1a" });
    else if (w === "club") P.club(hand[0], hand[1], 34, -72, { spikes: o.spikes, col: o.clubCol || "#7a5030" });
    else if (w === "hammer") {
      P.part(tube([[hand[0] - 2, hand[1] - 10], [hand[0] + 8, hand[1] + 24]], 3.6), "#5a3a24", { d: 0.8, l: 0.4, lw: 1.4 });
      P.part(rrect(hand[0] - 2, hand[1] + 20, 22, 16, 3), o.hammerCol || metal, { d: 2.6, l: 1.4 });
      P.part(rrect(hand[0] + 1, hand[1] + 23, 16, 3, 1), light(o.hammerCol || metal, 0.8), { d: 0, l: 0, lw: 1 });
    }
    P.part(tube([[64, 36], [74, 48], hand], [12, 11, 10]), skin, { d: 2 });
    if (o.bracer) P.part(tube([[74, 49], [79, 56]], 10.6), o.bracer, { d: 1.2, l: 0.6, lw: 1.5 });
    P.part(ell(hand[0], hand[1], 6.4, 6), skin, { d: 1.2, lw: 1.6 });
    /* 머리는 맨 나중에(팔에 가리지 않게) */
    BRUTE_HEAD[o.head || "orc"](P, 56, 22, skin, o);
    if (o.element === "storm") {
      P.stroke([[86, 10], [80, 20], [86, 24], [78, 36]], "#fff8a0", 2);
      P.glow(82, 24, 20, "#a0e0ff", 0.45);
    }
  };

  /* 거미: 큰 배, 여덟 다리, 여러 개의 눈. queen은 사람 상체(아라크네) */
  KINDS.spider = (P, o) => {
    const c = o.c1;
    const mark = o.c3 || "#e03030";
    const legsBack = [[40, 70, 22, 54, 8, 92], [46, 70, 34, 50, 22, 94], [56, 70, 66, 48, 76, 94], [62, 70, 78, 52, 92, 92]];
    legsBack.forEach(([x, y, kx, ky, fx, fy]) => P.part(tube([[x, y], [kx, ky], [fx, fy]], [4.4, 3.6, 1.6]), dark(c, 0.6), { d: 1, l: 0.4, lw: 1.5 }));
    const abd = ell(30, 64, 24, 20, -0.2);
    P.part(abd, c, { d: 5, l: 2 });
    P.inside(abd, blob([[22, 56], [30, 50], [38, 56], [34, 64], [38, 72], [30, 78], [22, 72], [26, 64]]), mark, { part: true, d: 1, l: 0.6 });
    for (let k = 0; k < 3; k++) P.stroke([[14 + k * 4, 58 + k * 8], [18 + k * 4, 54 + k * 8]], light(c, 0.6), 1.4);
    const ceph = ell(60, 70, 14, 11);
    P.part(ceph, c, { d: 3.4 });
    const legsFront = [[54, 74, 40, 62, 30, 94], [58, 76, 50, 66, 46, 95], [64, 76, 74, 62, 84, 95], [68, 74, 86, 60, 98, 92]];
    legsFront.forEach(([x, y, kx, ky, fx, fy]) => {
      P.part(tube([[x, y], [kx, ky]], [5, 4.2]), c, { d: 1.2, l: 0.6, lw: 1.5 });
      P.part(tube([[kx, ky], [fx, fy]], [4.2, 1.4]), c, { d: 1, l: 0.5, lw: 1.5 });
      P.fill(ell(kx, ky, 1.4, 1.4), light(c, 0.8));
    });
    if (o.queen) {
      const skin = o.skin || "#c8a8d8";
      P.part(blob([[56, 66], [54, 50], [60, 38], [70, 36], [74, 48], [70, 66]]), skin, { d: 3 });
      P.part(blob([[56, 44], [72, 42], [74, 54], [58, 56]]), dark(c, 0.2), { d: 2 });
      P.part(tube([[70, 40], [80, 46], [88, 40]], [5, 4.4, 3.6]), skin, { d: 1 });
      P.part(blob([[54, 30], [52, 14], [62, 6], [72, 10], [74, 24], [80, 44], [66, 30]]), o.hair || "#2a1838", { d: 2.4 });
      const h = ell(65, 22, 9, 10);
      P.part(h, skin, { d: 2.4 });
      P.eye(67, 21, 2.2, { type: "glow", iris: "#ff3060" });
      P.eye(73, 21, 1.8, { type: "glow", iris: "#ff3060" });
      P.eye(69, 16, 1.3, { type: "glow", iris: "#ff3060" });
      P.stroke([[66, 28], [70, 29], [73, 28]], "#5a1030", 1.4);
      P.crown(64, 13, 16, 10, "#f0c040", "#a020e0");
      P.part(poly([[88, 40], [92, 26], [94, 40]]), "#e8e0d0", { d: 0.4, l: 0.4, lw: 1.2 });
      return;
    }
    for (let k = 0; k < 3; k++) {
      P.eye(64 + k * 4, 66 - (k % 2) * 2, 1.9 - k * 0.2, { type: "glow", iris: o.iris || "#ff3040" });
      P.eye(65 + k * 4, 71 - (k % 2), 1.4, { type: "glow", iris: o.iris || "#ff3040" });
    }
    P.part(tube([[70, 76], [74, 82], [72, 86]], [3, 2.4, 1]), dark(c, 0.8), { d: 0.4, l: 0.2, lw: 1.3 });
    P.part(tube([[66, 77], [68, 84], [66, 88]], [3, 2.4, 1]), dark(c, 0.8), { d: 0.4, l: 0.2, lw: 1.3 });
  };

  /* 좀비: 앞으로 뻗은 팔, 찢어진 옷, 꿰맨 자국 */
  KINDS.zombie = (P, o) => {
    const skin = o.c1;
    const cloth = o.c2 || "#5a4a3a";
    leg(P, [42, 70], [40, 82], [34, 94], 9, dark(o.pants || "#3a3a4a", 0.4), { paw: true, pawCol: dark(skin, 0.6) });
    P.part(tube([[44, 42], [62, 48], [80, 48]], [8, 7, 6]), dark(skin, 0.5), { d: 1.4 });
    P.part(blob([[80, 44], [88, 46], [90, 50], [82, 52]]), dark(skin, 0.5), { d: 0.8, lw: 1.4 });
    const torso = blob([[36, 42], [56, 38], [62, 54], [60, 72], [40, 74], [34, 58]]);
    P.part(torso, cloth, { d: 4 });
    P.inside(torso, blob([[44, 50], [52, 48], [54, 60], [46, 62]]), skin, { part: true, d: 1, l: 0.4 });
    P.stroke([[45, 52], [52, 52]], dark(skin, 1.3), 1.2);
    P.stroke([[45, 56], [52, 56]], dark(skin, 1.3), 1.2);
    P.part(poly([[38, 70], [62, 70], [58, 78], [54, 74], [48, 80], [42, 74]]), o.pants || "#3a3a4a", { d: 2 });
    leg(P, [54, 72], [58, 82], [60, 94], 9, o.pants || "#3a3a4a", { paw: true, pawCol: dark(skin, 0.4) });
    const head = blob([[40, 34], [42, 20], [54, 14], [64, 20], [66, 32], [58, 40], [46, 40]]);
    P.part(head, skin, { d: 3 });
    P.part(blob([[40, 26], [44, 16], [52, 12], [46, 22], [44, 30]]), o.hair || "#3a3020", { d: 1 });
    P.stroke([[48, 18], [50, 26]], "#4a2a3a", 1.2);
    [[48.5, 20], [49.4, 23]].forEach(([x, y]) => P.stroke([[x - 1.4, y], [x + 1.4, y]], "#4a2a3a", 0.9));
    P.eye(56, 26, 3, { type: "glow", iris: o.iris || "#d8ff60" });
    P.part(ell(63, 28, 2.6, 2.6), "#f0e8d0", { d: 0.4, l: 0, lw: 1.2 });
    P.fill(ell(63.6, 28.6, 1, 1), "#1a1020");
    P.part(blob([[52, 33], [64, 32], [62, 38], [54, 38]]), "#3a1020", { d: 0, l: 0, lw: 1.4 });
    P.teeth(53, 33.4, 63, 32.4, 3, 1.8, "#d8d0a0");
    P.part(tube([[56, 44], [72, 50], [90, 50]], [8, 7, 6]), skin, { d: 1.6 });
    P.part(blob([[88, 46], [96, 48], [97, 52], [88, 54]]), skin, { d: 0.8, lw: 1.4 });
    [[96, 48], [97, 51]].forEach(([x, y]) => P.stroke([[x, y], [x + 2.4, y + 0.4]], "#e8e0c8", 1.2));
    if (o.flies) [[28, 22], [24, 30], [72, 16]].forEach(([x, y]) => { P.fill(ell(x, y, 1.2, 1), "#1a1a1a"); P.fill(ell(x - 0.6, y - 1.2, 1, 0.6), "rgba(220,230,255,0.8)"); });
  };

  /* 하피: 날개 팔, 새의 다리와 발톱, 깃털 머리 */
  KINDS.harpy = (P, o) => {
    const skin = o.skin || "#f0c8b0";
    const feather = o.c1;
    P.featherWing(44, 40, 44, -150, feather, { n: 7, spread: 12, tip: o.c2 || light(feather, 0.8) });
    const tailF = blob([[40, 70], [26, 86], [30, 90], [44, 80], [36, 94], [50, 82]]);
    P.part(tailF, dark(feather, 0.4), { d: 2 });
    P.part(tube([[46, 70], [42, 80], [44, 90]], [7, 5, 3]), o.legCol || "#e0b040", { d: 1, l: 0.6 });
    P.part(tube([[56, 70], [60, 80], [58, 90]], [7, 5, 3]), o.legCol || "#e0b040", { d: 1, l: 0.6 });
    [[44, 90], [58, 90]].forEach(([x, y]) => [-1, 0, 1].forEach((k) => P.part(tube([[x, y], [x + 4 + k * 2, y + 4], [x + 7 + k * 3, y + 3]], [2, 1.4, 0.6]), "#2a2028", { d: 0.3, l: 0.2, lw: 1 })));
    const body = blob([[40, 46], [56, 42], [62, 56], [60, 72], [42, 74], [38, 58]]);
    P.part(body, skin, { d: 4 });
    P.part(blob([[38, 58], [62, 56], [64, 72], [40, 76]]), feather, { d: 3 });
    P.part(blob([[40, 44], [58, 42], [60, 52], [42, 54]]), o.top || dark(feather, 0.3), { d: 2 });
    P.featherWing(58, 50, 38, -18, feather, { n: 6, spread: 11, tip: o.c2 || light(feather, 0.8) });
    const head = blob([[42, 32], [44, 18], [56, 14], [66, 22], [66, 32], [58, 40], [46, 40]]);
    P.part(head, skin, { d: 3 });
    const hair = blob([[38, 40], [36, 22], [46, 8], [60, 8], [70, 18], [68, 24], [58, 16], [48, 20], [46, 34], [42, 46]]);
    P.part(hair, o.hair || feather, { d: 2.4 });
    if (o.wild) for (let k = 0; k < 5; k++) P.part(poly([[40 + k * 6, 14 - (k % 2) * 2], [36 + k * 7, 2 + (k % 2) * 3], [44 + k * 6, 12]]), o.hair || feather, { d: 0.6, l: 0.4, lw: 1.3 });
    P.eye(58, 26, 2.8, { type: o.wild ? "glow" : "round", iris: o.iris || "#f0c020", brow: true });
    if (o.wild) {
      P.part(blob([[56, 33], [64, 32], [62, 39], [57, 38]]), "#4a1020", { d: 0, l: 0, lw: 1.3 });
      P.teeth(56.5, 33.2, 63.5, 32.4, 2, 2);
    } else P.stroke([[57, 34], [61, 35], [64, 33]], "#8a4a4a", 1.4);
  };

  /* 리자드맨: 볏, 꼬리, 비늘 배, 창과 둥근 방패 */
  KINDS.lizard = (P, o) => {
    const c = o.c1;
    const belly = o.c2 || "#e8d890";
    P.part(tube([[38, 76], [24, 84], [12, 80], [6, 70]], [10, 8, 5, 2]), c, { d: 2 });
    leg(P, [42, 72], [38, 84], [36, 94], 10, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    P.shield(28, 56, 13, o.shield || "#8a5a30", { inner: "#a87a40", boss: "#e0c040" });
    const torso = blob([[36, 42], [56, 38], [64, 52], [62, 72], [42, 76], [34, 60]]);
    P.part(torso, c, { d: 4 });
    P.inside(torso, blob([[46, 44], [58, 44], [60, 70], [48, 74]]), belly, { part: true, d: 1.4, l: 0.6 });
    for (let k = 0; k < 5; k++) P.stroke([[48, 50 + k * 5], [59, 50 + k * 5]], dark(belly, 0.6), 1);
    P.part(blob([[36, 66], [64, 64], [66, 76], [50, 80], [36, 76]]), o.cloth || "#7a3a2a", { d: 2 });
    leg(P, [56, 74], [60, 84], [60, 94], 10, c, { paw: true, claws: "#f0e8d0" });
    const head = blob([[44, 32], [48, 20], [62, 18], [80, 24], [82, 32], [66, 38], [50, 40]]);
    P.part(head, c, { d: 3 });
    P.stroke([[66, 32], [78, 30], [82, 30]], inkOf(c), 1.6);
    P.teeth(68, 31.6, 80, 30.4, 4, 1.6);
    P.fill(ell(78, 25, 0.9, 0.7), "#1a1020");
    for (let k = 0; k < 5; k++) P.part(poly([[44 + k * 4, 22 - k * 0.6], [40 + k * 4, 8 + (k % 2) * 3], [48 + k * 4, 20 - k * 0.6]]), o.crest || "#e05030", { d: 0.6, l: 0.4, lw: 1.2 });
    P.eye(62, 25, 2.8, { type: "slit", iris: o.iris || "#f0d020", brow: true });
    P.spear(74, 58, 40, -82, {});
    P.part(tube([[60, 44], [70, 52], [74, 58]], [7, 6, 5.4]), c, { d: 1.4 });
    P.part(ell(74, 58, 4, 4), c, { d: 0.8, lw: 1.4 });
  };

  /* 늑대인간: 두 발로 선 늑대, 찢어진 바지, 큰 발톱 */
  KINDS.werewolf = (P, o) => {
    const c = o.c1;
    P.part(tube([[34, 70], [22, 74], [12, 66]], [9, 8, 4]), c, { d: 2 });
    leg(P, [42, 70], [34, 82], [38, 94], 12, dark(c, 0.5), { paw: true, claws: "#f0e8d8" });
    P.part(tube([[40, 38], [28, 52], [24, 66]], [11, 9, 8]), dark(c, 0.5), { d: 2 });
    [-1, 0, 1].forEach((k) => P.part(poly([[22 + k * 3, 68], [20 + k * 4, 76], [25 + k * 3, 70]]), "#f0e8d8", { d: 0, l: 0, lw: 1 }));
    const torso = blob([[32, 40], [50, 30], [66, 34], [72, 50], [66, 70], [44, 74], [34, 60]]);
    P.part(torso, c, { d: 5, l: 2 });
    P.inside(torso, ell(54, 54, 11, 13), light(c, 0.8));
    P.part(poly([[38, 66], [66, 66], [68, 78], [62, 76], [58, 84], [52, 78], [46, 84], [40, 76]]), o.pants || "#4a5a7a", { d: 2.4 });
    leg(P, [58, 74], [66, 84], [62, 94], 12, c, { paw: true, claws: "#f0e8d8" });
    for (let k = 0; k < 5; k++) P.part(poly([[36 + k * 6, 36 - k], [34 + k * 6, 26 - k * 1.4], [40 + k * 6, 34 - k]]), c, { d: 0.6, l: 0.4, lw: 1.2 });
    const head = blob([[52, 26], [58, 14], [68, 12], [78, 18], [92, 24], [92, 32], [78, 36], [62, 36]]);
    P.part(head, c, { d: 3.4 });
    P.part(poly([[58, 16], [56, 2], [66, 12]]), c, { d: 1, l: 0.6, lw: 1.4 });
    P.part(poly([[66, 13], [70, 0], [74, 14]]), c, { d: 1, l: 0.6, lw: 1.4 });
    P.part(ell(92, 26, 2.6, 2.2), "#1a1420", { d: 0.4, l: 0.4, lw: 1.2 });
    P.part(blob([[76, 30], [92, 30], [90, 36], [80, 37]]), "#4a1020", { d: 0, l: 0, lw: 1.4 });
    P.teeth(77, 30.4, 91, 30.2, 4, 2.4);
    P.eye(72, 21, 2.8, { type: "glow", iris: o.iris || "#ffd040" });
    P.part(tube([[64, 38], [76, 48], [84, 50]], [11, 9, 8]), c, { d: 2 });
    [-1, 0, 1].forEach((k) => P.part(poly([[86, 48 + k * 3], [96, 46 + k * 4], [88, 51 + k * 3]]), "#f0e8d8", { d: 0, l: 0, lw: 1 }));
  };

  /* 정령: fire(불꽃 몸) · ice(얼음 결정) · candle(촛불 도깨비) · blizzard(눈보라) · star(별똥) */
  KINDS.wisp = (P, o) => {
    const t = o.type || "fire";
    if (t === "fire") {
      P.glow(50, 56, 46, "#ff7020", 0.35);
      const outer = blob([[30, 90], [24, 66], [30, 46], [36, 30], [44, 18], [46, 34], [54, 12], [60, 30], [70, 20], [70, 40], [78, 56], [74, 80], [66, 92]]);
      P.part(outer, o.c1 || "#e8401a", { d: 3, l: 1.4 });
      const mid = blob([[36, 86], [32, 66], [40, 48], [48, 36], [54, 50], [62, 38], [66, 56], [66, 80], [58, 88]]);
      P.part(mid, o.c2 || "#ff9a20", { d: 2, l: 1, line: false });
      P.part(blob([[42, 82], [40, 66], [48, 56], [56, 62], [60, 78], [52, 86]]), "#ffe060", { d: 1.4, l: 0.6, line: false });
      P.part(tube([[34, 62], [22, 56], [18, 46]], [7, 5, 2]), o.c2 || "#ff9a20", { d: 1, l: 0.6 });
      P.part(tube([[66, 60], [78, 54], [84, 44]], [7, 5, 2]), o.c2 || "#ff9a20", { d: 1, l: 0.6 });
      P.eye(46, 64, 3.6, { type: "glow", iris: "#fff6c0", squint: true });
      P.eye(58, 64, 3.6, { type: "glow", iris: "#fff6c0", squint: true });
      P.part(blob([[46, 72], [58, 72], [54, 78], [50, 78]]), "#8a1a0a", { d: 0, l: 0, lw: 1.4 });
      [[20, 30], [82, 26], [14, 70], [88, 74]].forEach(([x, y]) => P.part(ell(x, y, 1.6, 2.4), "#ffd040", { d: 0, l: 0, lw: 1 }));
      return;
    }
    if (t === "ice" || t === "blizzard") {
      const col = o.c1 || "#8ae0ff";
      P.glow(50, 52, 44, "#80e0ff", 0.3);
      if (t === "blizzard") {
        for (let k = 0; k < 3; k++) P.part(blob([[16 + k * 4, 70 - k * 14], [50, 56 - k * 18], [86 - k * 4, 66 - k * 14], [50, 76 - k * 16]]), k % 2 ? "#f4f8ff" : "#c8e4f4", { d: 1.6, l: 1, lw: 1.4 });
        P.part(tube([[50, 80], [46, 88], [52, 94]], [10, 6, 2]), "#e0f0ff", { d: 1, l: 0.6 });
      }
      const shards = [[50, 50, 14, 0], [36, 62, 9, -0.6], [64, 62, 9, 0.6], [44, 30, 7, -0.3], [60, 32, 6, 0.4], [50, 76, 8, 0]];
      shards.forEach(([x, y, r, rot], k) => {
        const s = turned(poly([[x, y - r * 1.6], [x + r * 0.7, y - r * 0.2], [x + r * 0.4, y + r * 1.2], [x - r * 0.4, y + r * 1.2], [x - r * 0.7, y - r * 0.2]]), x, y, rot);
        P.part(s, k % 2 ? light(col, 0.5) : col, { d: 1.6, l: 1.4, lw: 1.5 });
        P.stroke([[x, y - r * 1.4], [x, y + r]], "rgba(255,255,255,0.8)", 1);
      });
      P.eye(45, 50, 3.2, { type: "glow", iris: "#ffffff" });
      P.eye(56, 50, 3.2, { type: "glow", iris: "#ffffff" });
      P.stroke([[46, 57], [50, 59], [54, 57]], "#2a5a8a", 1.4);
      [[14, 30], [86, 36], [20, 84], [84, 84]].forEach(([x, y]) => { P.stroke([[x - 3, y], [x + 3, y]], "#ffffff", 1.2); P.stroke([[x, y - 3], [x, y + 3]], "#ffffff", 1.2); });
      return;
    }
    if (t === "candle") {
      P.glow(52, 36, 34, "#ffd060", 0.45);
      const wax = blob([[36, 94], [36, 56], [44, 52], [60, 52], [66, 56], [66, 94]]);
      P.part(wax, o.c2 || "#f4e8c8", { d: 4 });
      [[40, 56, 66], [52, 54, 70], [62, 56, 62]].forEach(([x, y, y2]) => P.part(tube([[x, y], [x, y2]], 4), light(o.c2 || "#f4e8c8", 0.4), { d: 0.8, l: 0.4, lw: 1.2 }));
      P.part(ell(51, 94, 18, 3), "#a87a40", { d: 0.8, l: 0.4, lw: 1.4 });
      P.stroke([[51, 52], [51, 46]], "#2a2020", 1.6);
      const flame = blob([[38, 46], [40, 30], [48, 14], [52, 4], [56, 16], [64, 30], [64, 46], [51, 52]]);
      P.part(flame, o.c1 || "#ff9a20", { d: 2, l: 1.2 });
      P.part(blob([[44, 46], [46, 34], [52, 22], [58, 34], [58, 46]]), "#ffe070", { d: 1, l: 0.6, line: false });
      P.eye(47, 38, 2.6, { type: "cute" });
      P.eye(56, 38, 2.6, { type: "cute" });
      P.stroke([[49, 44], [51.5, 46], [54, 44]], "#8a3a0a", 1.2);
      P.fill(ell(44, 42, 2, 1.2), "#ff7a5a");
      P.fill(ell(59, 42, 2, 1.2), "#ff7a5a");
      P.part(tube([[36, 70], [26, 64], [24, 58]], [5, 4, 3.4]), o.c2 || "#f4e8c8", { d: 0.8 });
      P.part(tube([[66, 70], [76, 64], [78, 58]], [5, 4, 3.4]), o.c2 || "#f4e8c8", { d: 0.8 });
      return;
    }
    if (t === "star") {
      P.glow(56, 44, 44, "#fff2a0", 0.45);
      [[10, 74, 10], [20, 66, 8], [30, 58, 6]].forEach(([x, y, r], k) => P.part(ell(x, y, r, r * 0.6, -0.6), k % 2 ? "#fff6c8" : "#ffd860", { d: 0.8, l: 0.4, lw: 1.2 }));
      const star = new Path2D();
      for (let i = 0; i < 10; i++) { const [x, y] = pol(56, 46, i % 2 ? 13 : 30, -90 + i * 36); i ? star.lineTo(x, y) : star.moveTo(x, y); }
      star.closePath();
      P.part(star, o.c1 || "#ffd040", { d: 3, l: 1.6 });
      P.eye(50, 46, 2.8, { type: "cute" });
      P.eye(61, 46, 2.8, { type: "cute" });
      P.stroke([[52, 53], [55.5, 56], [59, 53]], "#8a5a0a", 1.4);
      P.fill(ell(46, 51, 2.4, 1.4), "#ff9a8a");
      P.fill(ell(65, 51, 2.4, 1.4), "#ff9a8a");
    }
  };

  /* 망령: 너덜너덜한 천 몸, 뻗은 손, 텅 빈 눈 */
  KINDS.ghost = (P, o) => {
    const c = o.c1 || "#c8d0e0";
    P.glow(50, 50, 44, o.aura || "#a0b0ff", 0.25);
    const body = blob([[30, 44], [38, 22], [54, 14], [68, 20], [74, 40], [76, 62], [70, 80], [62, 74], [56, 92], [48, 78], [40, 90], [34, 72], [24, 82], [26, 60]]);
    P.part(body, c, { d: 5, l: 2 });
    P.inside(body, blob([[40, 30], [60, 26], [66, 40], [60, 52], [42, 54], [36, 42]]), "#1a1428");
    P.eye(46, 40, 3.4, { type: "glow", iris: o.iris || "#80f0ff" });
    P.eye(58, 40, 3.2, { type: "glow", iris: o.iris || "#80f0ff" });
    P.part(blob([[48, 48], [56, 47], [55, 52], [49, 52]]), "#0a0812", { d: 0, l: 0, lw: 1.2 });
    P.part(tube([[66, 48], [80, 44], [90, 36]], [8, 6, 4]), c, { d: 1.6 });
    [-1, 0, 1, 2].forEach((k) => P.part(tube([[90, 36], [94 + k, 30 + k * 3]], [1.8, 0.8]), "#e8f0ff", { d: 0, l: 0, lw: 1 }));
    if (o.chains) {
      P.stroke([[28, 62], [18, 70], [10, 84]], "#8a8a98", 2);
      for (let k = 0; k < 4; k++) P.part(ell(26 - k * 5, 64 + k * 6, 2.4, 1.6, 0.8), "#a8a8b8", { d: 0.4, l: 0.4, lw: 1.1 });
    }
  };

  /* 요정: 잠자리 날개, 꽃잎 옷, 꽃 머리띠 */
  KINDS.fairy = (P, o) => {
    const skin = o.skin || "#f8d8c0";
    P.glow(50, 50, 40, o.c3 || "#c0ffe0", 0.4);
    [[44, 46, -140, 26], [44, 50, 160, 20]].forEach(([x, y, a, s]) => P.part(turned(ell(x - s * 0.5, y, s * 0.55, s * 0.24), x, y, ((a + 180) * Math.PI) / 180), "rgba(200,255,250,0.85)", { d: 1, l: 1, lw: 1.2, light: "#ffffff" }));
    const dress = blob([[42, 50], [58, 50], [66, 70], [58, 74], [50, 70], [42, 74], [34, 70]]);
    P.part(dress, o.c1 || "#60c060", { d: 2.4 });
    P.part(tube([[46, 72], [44, 82]], 3), skin, { d: 0.6 });
    P.part(tube([[54, 72], [57, 81]], 3), skin, { d: 0.6 });
    P.part(blob([[44, 40], [56, 40], [58, 52], [44, 52]]), o.c1 || "#60c060", { d: 1.4 });
    P.part(tube([[56, 44], [64, 40], [68, 34]], [3.4, 3, 2.6]), skin, { d: 0.6 });
    P.part(ell(68, 33, 2.4, 2.4), skin, { d: 0.4, lw: 1.2 });
    P.part(ell(69, 30, 2.6, 2.6), "#fff8a0", { d: 0, l: 0, lw: 1 });
    P.glow(69, 30, 10, "#fff8a0", 0.6);
    P.part(blob([[38, 32], [40, 16], [52, 10], [64, 16], [66, 30], [60, 26], [46, 26], [42, 40]]), o.hair || "#f0d040", { d: 2 });
    P.part(ell(54, 30, 10, 10), skin, { d: 2 });
    P.part(blob([[42, 26], [46, 16], [56, 14], [64, 22], [58, 22], [52, 26], [46, 30]]), o.hair || "#f0d040", { d: 1.4 });
    P.eye(54, 31, 2.4, { type: "cute" });
    P.eye(61, 31, 2.2, { type: "cute" });
    P.fill(ell(52, 36, 1.8, 1), "#ff9ab0");
    P.stroke([[57, 37], [59, 38], [61, 37]], "#a04a4a", 1);
    [[44, 18], [50, 14], [58, 14]].forEach(([x, y], k) => P.part(ell(x, y, 2.4, 2.4), ["#ff8ab0", "#ffffff", "#ff6a8a"][k], { d: 0, l: 0, lw: 1 }));
  };

  /* 집게: 단단한 등딱지, 큰 집게 둘, 눈자루. iron(리벳)·ice(결정)·void(빛 무늬) */
  KINDS.crab = (P, o) => {
    const c = o.c1;
    const under = o.c2 || light(c, 0.8);
    for (let k = 0; k < 3; k++) {
      P.part(tube([[34 - k * 4, 74], [18 - k * 4, 72 + k * 4], [12 - k * 2, 92]], [5, 4, 1.6]), dark(c, 0.6), { d: 1, l: 0.4, lw: 1.4 });
      P.part(tube([[66 + k * 4, 74], [82 + k * 3, 72 + k * 4], [88 + k * 2, 92]], [5, 4, 1.6]), c, { d: 1, l: 0.4, lw: 1.4 });
    }
    /* 뒤 집게 */
    P.part(tube([[34, 62], [20, 52], [16, 40]], [8, 7, 6]), dark(c, 0.5), { d: 1.4 });
    P.part(blob([[6, 36], [14, 26], [26, 30], [24, 40], [16, 44]]), dark(c, 0.5), { d: 2 });
    P.part(poly([[8, 34], [2, 22], [14, 28]]), dark(c, 0.5), { d: 1, l: 0.6, lw: 1.4 });
    const shell = blob([[22, 74], [24, 58], [38, 48], [62, 48], [76, 58], [78, 74], [66, 82], [34, 82]]);
    P.part(shell, c, { d: 5, l: 2.4 });
    P.inside(shell, ell(50, 82, 26, 6), under);
    if (o.style === "iron") {
      P.stroke([[30, 62], [50, 56], [70, 62]], dark(c, 1.2), 1.6);
      [[34, 66], [44, 62], [56, 62], [66, 66], [50, 72]].forEach(([x, y]) => P.part(ell(x, y, 1.6, 1.6), light(c, 0.8), { d: 0.4, l: 0.4, lw: 1 }));
    } else if (o.style === "ice") {
      [[34, 52], [46, 46], [58, 46], [68, 52]].forEach(([x, y], k) => P.part(poly([[x - 4, y + 4], [x, y - 12 - (k % 2) * 4], [x + 4, y + 4]]), k % 2 ? "#e0f8ff" : "#a0e4ff", { d: 0.6, l: 0.8, lw: 1.3 }));
    } else if (o.style === "void") {
      P.inside(shell, blob([[40, 58], [50, 54], [60, 58], [56, 66], [44, 66]]), "#ff60e0");
      P.glow(50, 60, 20, "#ff60e0", 0.45);
    }
    /* 눈자루 */
    [[56, 50], [64, 50]].forEach(([x, y]) => {
      P.part(tube([[x, y], [x + 2, y - 10]], 2.6), c, { d: 0.6, l: 0.3, lw: 1.3 });
      P.part(ell(x + 2, y - 12, 3.2, 3.2), "#f4f0e0", { d: 0.6, l: 0, lw: 1.3 });
      P.fill(ell(x + 3, y - 12, 1.4, 1.6), "#120c18");
      if (o.glowEye) P.glow(x + 2, y - 12, 8, o.glowEye, 0.6);
    });
    P.stroke([[58, 70], [64, 72], [70, 70]], inkOf(c), 1.6);
    /* 앞 집게(들어 올림) */
    P.part(tube([[66, 62], [80, 54], [86, 42]], [9, 8, 7]), c, { d: 1.6 });
    const claw = blob([[78, 40], [80, 24], [92, 18], [98, 28], [94, 38], [86, 44]]);
    P.part(claw, c, { d: 3, l: 1.4 });
    P.part(blob([[90, 30], [100, 34], [96, 44], [88, 42]]), c, { d: 1.6, l: 1 });
    P.teeth(84, 30, 94, 32, 3, 2, "#f4ecd8");
  };

  /* 식인 꽃의 여왕: 이빨 달린 거대한 꽃, 가시 덩굴, 잎 팔, 꽃잎 왕관 */
  KINDS.flower = (P, o) => {
    const petal = o.c1;
    const inner = o.c2 || "#c02a6a";
    const stem = o.c3 || "#3a8a3a";
    [[20, 94, 30, 80], [44, 96, 46, 82], [70, 96, 60, 82], [86, 94, 74, 80]].forEach(([x1, y1, x2, y2]) => P.part(tube([[x2, y2], [x1, y1]], [7, 2]), dark(stem, 0.5), { d: 1 }));
    P.part(ell(50, 86, 22, 9), dark(stem, 0.4), { d: 2 });
    P.part(tube([[16, 70], [8, 54], [14, 40], [6, 28]], [5, 4, 3, 1.4]), stem, { d: 1 });
    for (let k = 0; k < 4; k++) { const [x, y] = [[10, 60], [11, 46], [9, 36], [12, 52]][k]; P.part(poly([[x, y], [x - 5, y - 2], [x, y + 3]]), "#e8e0c8", { d: 0, l: 0, lw: 1 }); }
    P.part(tube([[50, 84], [48, 66], [52, 52]], [12, 10, 8]), stem, { d: 2 });
    P.part(blob([[48, 72], [30, 62], [22, 50], [34, 54], [46, 64]]), light(stem, 0.4), { d: 2 });
    P.part(blob([[52, 70], [72, 64], [84, 54], [70, 56], [54, 64]]), light(stem, 0.4), { d: 2 });
    /* 꽃잎 */
    for (let k = 0; k < 8; k++) {
      const a = -90 + k * 45;
      const tip = pol(52, 36, 30, a);
      const l2 = pol(52, 36, 16, a - 22);
      const r2 = pol(52, 36, 16, a + 22);
      P.part(blob([[52, 36], l2, tip, r2]), k % 2 ? petal : light(petal, 0.6), { d: 2, l: 1.2 });
    }
    const face = ell(52, 36, 15, 14);
    P.part(face, inner, { d: 3 });
    P.inside(face, ell(54, 40, 10, 8), "#3a0a1a");
    P.teeth(44, 34, 62, 34, 5, 4);
    P.teeth(46, 46, 62, 46, 4, -3.4);
    P.part(tube([[54, 46], [58, 52], [64, 52]], [3.4, 2.6, 1.6]), "#ff6a9a", { d: 0.6, l: 0.4, lw: 1.2 });
    P.eye(46, 27, 2.4, { type: "glow", iris: "#ffe040" });
    P.eye(58, 27, 2.4, { type: "glow", iris: "#ffe040" });
    if (o.queen) P.crown(52, 10, 18, 11, "#f0c040", "#40d0a0");
    P.part(tube([[84, 66], [92, 52], [86, 40], [94, 30]], [5, 4, 3, 1.4]), stem, { d: 1 });
    [[90, 58], [89, 44], [91, 34]].forEach(([x, y]) => P.part(poly([[x, y], [x + 5, y - 2], [x, y + 3]]), "#e8e0c8", { d: 0, l: 0, lw: 1 }));
  };

  /* 가고일: 받침돌 위에 웅크린 돌 악마, 돌 날개와 금 간 몸 */
  KINDS.gargoyle = (P, o) => {
    const c = o.c1;
    P.part(rrect(22, 82, 58, 14, 2), dark(c, 0.6), { d: 2, l: 1 });
    P.part(rrect(18, 78, 66, 6, 2), dark(c, 0.3), { d: 1, l: 0.8 });
    P.batWing(40, 46, 44, -150, c, dark(c, 0.8), { claw: light(c, 0.6) });
    P.part(tube([[30, 74], [18, 70], [10, 60], [12, 50]], [6, 5, 3, 1.6]), c, { d: 1.2 });
    P.part(poly([[8, 52], [12, 42], [17, 52]]), c, { d: 0.6, l: 0.4, lw: 1.3 });
    const body = blob([[34, 52], [50, 42], [64, 48], [66, 64], [58, 78], [38, 78], [32, 66]]);
    P.part(body, c, { d: 5 });
    P.stroke([[44, 52], [48, 60], [45, 66]], dark(c, 1.2), 1.2);
    leg(P, [40, 70], [30, 66], [32, 80], 11, dark(c, 0.4), { paw: true, claws: light(c, 0.8) });
    leg(P, [56, 72], [66, 66], [64, 80], 11, c, { paw: true, claws: light(c, 0.8) });
    P.part(tube([[60, 52], [70, 62], [72, 76]], [8, 7, 6]), c, { d: 1.4 });
    [-1, 0, 1].forEach((k) => P.part(poly([[70 + k * 3, 77], [72 + k * 3.4, 82], [74 + k * 3, 77]]), light(c, 0.8), { d: 0, l: 0, lw: 1 }));
    const head = blob([[52, 38], [56, 24], [68, 22], [78, 30], [78, 40], [68, 46], [56, 46]]);
    P.part(head, c, { d: 3 });
    P.horn(58, 26, 16, -120, -50, 5, light(c, 0.4), {});
    P.horn(68, 24, 14, -70, 40, 4.4, light(c, 0.4), {});
    P.part(poly([[52, 30], [42, 24], [52, 36]]), c, { d: 0.8, l: 0.4, lw: 1.3 });
    P.eye(70, 33, 2.8, { type: "glow", iris: o.iris || "#ff8a30" });
    P.part(blob([[66, 40], [79, 38], [76, 44], [68, 45]]), "#1a1420", { d: 0, l: 0, lw: 1.3 });
    P.teeth(67, 40.4, 78, 38.6, 3, 2.2, light(c, 1));
    P.stroke([[60, 30], [64, 38], [62, 42]], dark(c, 1.2), 1);
  };

  /* 용: wyvern(두 다리·날개 팔·독침 꼬리) 또는 dragon(네 다리·큰 날개). 등 가시, 뿔, 불꽃 */
  KINDS.dragon = (P, o) => {
    const c = o.c1;
    const belly = o.c2 || "#e8d090";
    const wyv = o.wyvern;
    const boss = o.boss;
    P.batWing(42, 46, boss ? 58 : 50, -128, c, o.mem || dark(c, 0.7), {});
    if (!wyv) leg(P, [32, 72], [26, 82], [24, 94], 10, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    P.part(tube([[30, 70], [16, 74], [8, 66], [4, 54]], [14, 10, 6, 2]), c, { d: 2.4 });
    if (wyv) P.part(poly([[2, 56], [4, 42], [10, 54]]), "#a8e040", { d: 0.6, l: 0.6, lw: 1.3 });
    else P.part(poly([[0, 56], [6, 44], [10, 56]]), dark(c, 0.6), { d: 0.6, l: 0.4, lw: 1.3 });
    leg(P, [56, 72], [52, 84], [52, 94], 11, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    const body = blob([[26, 70], [32, 52], [52, 46], [68, 50], [74, 64], [66, 78], [40, 80]]);
    P.part(body, c, { d: 5, l: 2 });
    P.inside(body, blob([[40, 80], [52, 64], [70, 60], [74, 68], [64, 80]]), belly, { part: true, d: 1.4, l: 0.6 });
    for (let k = 0; k < 4; k++) P.stroke([[52 + k * 5, 68 - k * 2], [56 + k * 5, 78 - k * 2]], dark(belly, 0.7), 1);
    for (let k = 0; k < 6; k++) P.part(poly([[24 + k * 7, 56 - k * 1.6], [27 + k * 7, 44 - k * 2], [31 + k * 7, 54 - k * 1.6]]), o.spine || dark(c, 0.8), { d: 0.6, l: 0.4, lw: 1.2 });
    if (!wyv) leg(P, [40, 74], [36, 84], [36, 94], 12, c, { paw: true, claws: "#f0e8d0" });
    leg(P, [62, 74], [68, 84], [66, 94], 12, c, { paw: true, claws: "#f0e8d0" });
    /* 목과 머리 */
    P.part(tube([[60, 56], [70, 44], [74, 32]], [16, 12, 10]), c, { d: 2.4 });
    P.inside(tube([[60, 56], [70, 44], [74, 32]], [16, 12, 10]), tube([[64, 56], [74, 44], [78, 34]], [6, 5, 4]), belly);
    const head = blob([[66, 30], [72, 20], [84, 20], [96, 28], [96, 34], [84, 38], [70, 38]]);
    P.part(head, c, { d: 3 });
    P.part(blob([[78, 34], [96, 33], [94, 38], [80, 40]]), dark(c, 0.3), { d: 1.2, l: 0.6, lw: 1.5 });
    P.teeth(80, 34.4, 94, 33.4, 4, 2.2);
    P.fill(ell(93, 27, 1, 0.8), "#1a1020");
    P.horn(70, 22, boss ? 22 : 16, -150, 30, 5, o.horn || "#f0e4c4", { rings: boss });
    P.horn(76, 20, boss ? 18 : 12, -120, 20, 4, o.horn || "#f0e4c4", {});
    P.eye(80, 26, 2.6, { type: o.glowEye ? "glow" : "slit", iris: o.iris || "#ffd030", brow: !o.glowEye });
    if (wyv) P.batWing(56, 50, 40, -60, c, o.mem || dark(c, 0.7), {});
    if (o.fire) {
      P.part(blob([[94, 36], [100, 32], [100, 44], [96, 42]]), "#ff7a20", { d: 0.6, l: 0.6, lw: 1.2 });
      P.glow(96, 36, 14, "#ff8a2a", 0.6);
      [[86, 12], [92, 8]].forEach(([x, y]) => P.fill(ell(x, y, 2.4, 1.6), "rgba(120,110,120,0.7)"));
    }
    if (o.shadow) [[20, 90], [44, 94], [70, 92]].forEach(([x, y]) => P.fill(ell(x, y, 12, 4), "rgba(60,20,90,0.55)"));
  };

  /* 흡혈귀: 높은 깃 망토, 송곳니. noble은 박쥐 날개 망토와 술잔, succubus는 뿔·날개·꼬리 */
  KINDS.vampire = (P, o) => {
    const skin = o.skin || "#e8e0e8";
    const cape = o.c1;
    const lining = o.c2 || "#a01020";
    const suc = o.succubus;
    if (suc) {
      P.batWing(44, 44, 40, -140, o.wing || "#5a2a6a", "#3a1840", {});
      P.part(tube([[40, 72], [26, 80], [18, 70], [20, 60]], [3, 2.4, 2, 1.6]), o.wing || "#5a2a6a", { d: 0.6 });
      const heart = blob([[20, 60], [16, 54], [20, 50], [22, 53], [25, 50], [28, 54]]);
      P.part(heart, "#ff4a8a", { d: 0.6, l: 0.4, lw: 1.2 });
    } else {
      const outer = blob([[30, 30], [52, 26], [72, 32], [80, 94], [50, 90], [20, 94], [26, 60]]);
      P.part(outer, cape, { d: 5, l: 2 });
      P.inside(outer, blob([[36, 34], [52, 30], [66, 34], [70, 92], [52, 86], [32, 92], [34, 60]]), lining, { part: true, d: 2, l: 1 });
      if (o.noble) for (let k = 0; k < 4; k++) P.part(poly([[22 + k * 2, 94 - k * 14], [12 - k, 86 - k * 16], [24 + k * 2, 82 - k * 14]]), cape, { d: 0.6, l: 0.4, lw: 1.3 });
    }
    P.part(tube([[44, 70], [42, 84], [40, 94]], [8, 7, 6]), o.pants || "#1a1a24", { d: 1.2 });
    P.part(tube([[54, 70], [56, 84], [58, 94]], [8, 7, 6]), o.pants || "#2a2a34", { d: 1.2 });
    const torso = blob([[40, 40], [58, 38], [62, 54], [58, 74], [42, 74], [38, 56]]);
    P.part(torso, suc ? o.dress || "#3a1840" : o.coat || "#2a2030", { d: 4 });
    if (!suc) {
      P.part(poly([[46, 40], [54, 40], [52, 60], [48, 60]]), "#f0e8f0", { d: 1, l: 0.6, lw: 1.3 });
      P.part(ell(50, 48, 2.4, 2.4), "#e02040", { d: 0.4, l: 0.4, lw: 1.1 });
    } else P.part(blob([[42, 42], [58, 40], [56, 50], [44, 50]]), skin, { d: 1.6 });
    /* 높은 깃 */
    if (!suc) P.part(blob([[34, 40], [36, 16], [46, 30], [56, 30], [66, 14], [68, 40], [52, 44]]), cape, { d: 2.4 });
    const head = blob([[42, 30], [44, 16], [56, 12], [64, 18], [64, 30], [56, 38], [46, 36]]);
    P.part(head, skin, { d: 3 });
    P.part(blob([[40, 28], [40, 12], [52, 4], [64, 8], [68, 16], [58, 12], [48, 16], [44, 30]]), o.hair || "#1a1424", { d: 2 });
    if (o.noble || suc) P.part(tube([[40, 22], [36, 40], [38, 52]], [7, 6, 3]), o.hair || "#1a1424", { d: 1.2 });
    if (suc) {
      P.horn(46, 10, 12, -120, -40, 4, "#2a1a2a", {});
      P.horn(58, 8, 12, -70, 40, 4, "#2a1a2a", {});
    }
    if (o.noble) P.part(poly([[44, 10], [48, 4], [52, 8], [56, 2], [60, 8], [62, 12], [44, 14]]), "#c8a040", { d: 0.8, l: 0.6, lw: 1.3 });
    P.eye(56, 22, 2.8, { type: suc ? "round" : "glow", iris: o.iris || "#ff2040", brow: !suc });
    P.stroke([[54, 30], [58, 31], [62, 29]], suc ? "#c0304a" : "#5a1a2a", 1.4);
    if (!suc) {
      P.part(poly([[55, 30.6], [56.2, 34], [57.2, 30.8]]), "#ffffff", { d: 0, l: 0, lw: 0.9 });
      P.part(poly([[59.4, 30.6], [60.4, 33.6], [61.4, 30.2]]), "#ffffff", { d: 0, l: 0, lw: 0.9 });
    }
    /* 앞팔: 손을 들어 올린다 */
    P.part(tube([[58, 44], [70, 40], [76, 30]], [7, 6, 5]), suc ? skin : o.coat || "#2a2030", { d: 1.4 });
    P.part(ell(77, 28, 3.6, 3.4), skin, { d: 0.6, lw: 1.3 });
    if (o.noble) {
      P.part(blob([[74, 14], [82, 14], [80, 22], [76, 22]]), "#e8e0f0", { d: 0.6, l: 0.4, lw: 1.2 });
      P.part(blob([[75, 15], [81, 15], [80, 19], [76, 19]]), "#a00a20", { d: 0, l: 0, lw: 0.8 });
      P.stroke([[78, 22], [78, 27]], "#e8e0f0", 1.2);
    } else [-1, 0, 1].forEach((k) => P.part(poly([[76 + k * 2, 25], [77 + k * 3, 19], [79 + k * 2, 25]]), "#e8e0e8", { d: 0, l: 0, lw: 0.9 }));
    if (suc) P.glow(78, 26, 12, "#ff6ab0", 0.5);
  };

  /* 골렘: rock(바위 덩어리) · steel(강철판·리벳) · time(금빛 시계 몸과 톱니) */
  KINDS.golem = (P, o) => {
    const c = o.c1;
    const glowCol = o.c3 || "#ffa030";
    const st = o.style || "rock";
    const chunk = (x, y, r, col, rot) => {
      const pts = [];
      for (let k = 0; k < 7; k++) pts.push(pol(x, y, r * (0.82 + ((k * 37) % 9) / 40), k * 51 + (rot || 0)));
      return st === "rock" ? poly(pts) : rrect(x - r, y - r * 0.9, r * 2, r * 1.8, r * 0.35);
    };
    /* 다리와 뒷팔 */
    P.part(chunk(40, 86, 9, c, 10), dark(c, 0.4), { d: 2 });
    P.part(chunk(62, 86, 9, c, 30), c, { d: 2 });
    P.part(chunk(24, 52, 8, c, 5), dark(c, 0.4), { d: 2 });
    P.part(chunk(18, 66, 9, c, 50), dark(c, 0.4), { d: 2 });
    const torso = st === "rock" ? poly([[28, 44], [44, 32], [64, 32], [78, 46], [76, 70], [60, 80], [38, 78], [26, 64]]) : rrect(28, 34, 50, 44, 10);
    P.part(torso, c, { d: 6, l: 2 });
    if (st === "rock") {
      P.stroke([[40, 40], [46, 52], [42, 60]], dark(c, 1.2), 1.4);
      P.stroke([[62, 44], [58, 56], [64, 66]], dark(c, 1.2), 1.4);
      P.inside(torso, blob([[26, 40], [44, 32], [52, 38], [40, 46], [30, 50]]), o.moss || "#5a9a3a", { part: true, d: 1, l: 0.6 });
      P.part(poly([[48, 52], [54, 48], [58, 54], [54, 60], [48, 58]]), glowCol, { d: 0.8, l: 0.8, lw: 1.3 });
      P.glow(53, 54, 16, glowCol, 0.55);
    } else if (st === "steel") {
      [[34, 40], [70, 40], [34, 72], [70, 72]].forEach(([x, y]) => P.part(ell(x, y, 1.6, 1.6), light(c, 1), { d: 0.4, l: 0.4, lw: 1 }));
      P.stroke([[28, 56], [78, 56]], dark(c, 1), 1.6);
      P.part(ell(53, 50, 7, 7), "#2a3038", { d: 0.6, l: 0, lw: 1.6 });
      P.part(ell(53, 50, 4.4, 4.4), glowCol, { d: 0.6, l: 0.8, lw: 1.2 });
      P.glow(53, 50, 18, glowCol, 0.6);
    } else {
      /* 가슴의 시계와 톱니 */
      const gear = (x, y, r, col) => {
        const p = new Path2D();
        for (let k = 0; k < 16; k++) { const [gx, gy] = pol(x, y, k % 2 ? r : r * 0.78, k * 22.5); k ? p.lineTo(gx, gy) : p.moveTo(gx, gy); }
        p.closePath();
        P.part(p, col, { d: 1.2, l: 0.8, lw: 1.3 });
        P.fill(ell(x, y, r * 0.3, r * 0.3), dark(col, 1));
      };
      gear(26, 34, 9, "#c89a30");
      gear(80, 34, 8, "#c89a30");
      P.part(ell(53, 54, 13, 13), "#f8f0d8", { d: 2, l: 0.6, lw: 2 });
      for (let k = 0; k < 12; k++) { const [x1, y1] = pol(53, 54, 10, k * 30); const [x2, y2] = pol(53, 54, 12, k * 30); P.stroke([[x1, y1], [x2, y2]], "#5a4a2a", k % 3 ? 0.9 : 1.6); }
      P.stroke([[53, 54], [53, 45]], "#3a2a1a", 1.8);
      P.stroke([[53, 54], [60, 57]], "#3a2a1a", 1.4);
      P.glow(53, 54, 22, glowCol, 0.4);
      P.part(ell(53, 18, 34, 6), "rgba(160,220,255,0.15)", { flat: true, line: false });
    }
    /* 머리 */
    const head = st === "rock" ? poly([[42, 30], [46, 18], [60, 16], [68, 24], [66, 34], [52, 36]]) : rrect(42, 14, 24, 20, 5);
    P.part(head, c, { d: 3 });
    if (st === "time") P.part(poly([[40, 16], [44, 6], [54, 12], [64, 4], [68, 16]]), "#e8c050", { d: 1, l: 0.8, lw: 1.4 });
    if (st === "steel") P.part(rrect(46, 22, 20, 5, 2), "#1a1a24", { d: 0, l: 0, lw: 1.4 });
    P.eye(st === "rock" ? 58 : 56, 25, 2.6, { type: "glow", iris: glowCol });
    if (st !== "steel") P.eye(st === "rock" ? 50 : 63, 25, 2.2, { type: "glow", iris: glowCol });
    /* 앞팔: 큰 주먹 */
    P.part(chunk(76, 50, 9, c, 40), c, { d: 2 });
    P.part(chunk(82, 66, 11, c, 20), c, { d: 2.4 });
    if (st === "steel") P.part(tube([[76, 52], [82, 64]], 4), "#5a6068", { d: 0.6, l: 0.4, lw: 1.3 });
  };

  /* 나가: 똬리 튼 뱀 하체, 지느러미 귀, 삼지창 */
  KINDS.naga = (P, o) => {
    const c = o.c1;
    const skin = o.skin || "#9ad8d0";
    const belly = o.c2 || "#e8e0a0";
    P.part(tube([[50, 72], [30, 74], [14, 82], [20, 92], [44, 94], [70, 92], [88, 86], [92, 76]], [16, 16, 14, 14, 13, 10, 6, 2]), c, { d: 3, l: 1.6 });
    P.inside(tube([[50, 72], [30, 74], [14, 82], [20, 92], [44, 94], [70, 92], [88, 86], [92, 76]], [16, 16, 14, 14, 13, 10, 6, 2]), tube([[30, 80], [20, 86], [44, 98], [70, 96]], [5, 5, 5, 3]), belly);
    for (let k = 0; k < 6; k++) P.stroke([[24 + k * 10, 88 + (k % 2)], [26 + k * 10, 84 + (k % 2)]], dark(c, 1), 1);
    const torso = blob([[40, 72], [42, 50], [52, 40], [62, 46], [64, 64], [58, 74]]);
    P.part(torso, skin, { d: 4 });
    P.part(blob([[42, 50], [62, 48], [62, 56], [44, 58]]), o.top || "#c8a040", { d: 1.4, l: 0.8 });
    P.part(blob([[40, 36], [36, 16], [48, 4], [62, 6], [70, 18], [72, 40], [64, 28], [56, 20], [46, 22], [46, 44]]), o.hair || "#2a6a8a", { d: 2.4 });
    const head = blob([[46, 28], [48, 16], [58, 12], [66, 18], [66, 28], [58, 36], [50, 34]]);
    P.part(head, skin, { d: 2.6 });
    P.part(poly([[46, 22], [38, 16], [40, 26]]), o.fin || "#40b0c0", { d: 0.6, l: 0.4, lw: 1.3 });
    P.eye(59, 22, 2.6, { type: "slit", iris: o.iris || "#ffd040" });
    P.stroke([[57, 30], [61, 31], [64, 29]], "#3a6a6a", 1.2);
    P.spear(70, 58, 46, -84, { trident: true, col: "#e8c040", shaft: "#6a5030" });
    P.part(tube([[60, 46], [68, 52], [70, 58]], [5.4, 5, 4.4]), skin, { d: 1 });
    P.part(ell(70, 58, 3.4, 3.2), skin, { d: 0.6, lw: 1.3 });
    P.part(tube([[63, 50], [66, 53]], 5.6), "#c8a040", { d: 0.6, l: 0.4, lw: 1.2 });
  };

  /* 켄타우로스 궁수: 말의 몸과 사람 상체, 활시위를 당긴다 */
  KINDS.centaur = (P, o) => {
    const coat = o.c1;
    const skin = o.skin || "#e0b088";
    P.part(tube([[22, 58], [12, 62], [8, 76]], [8, 7, 4]), o.hair || "#3a2418", { d: 1.4 });
    leg(P, [28, 70], [24, 82], [24, 94], 7, dark(coat, 0.5), { paw: true, pawCol: "#2a2020" });
    leg(P, [62, 70], [64, 82], [62, 94], 7, dark(coat, 0.5), { paw: true, pawCol: "#2a2020" });
    const body = blob([[20, 64], [26, 52], [52, 50], [70, 54], [74, 66], [62, 76], [30, 76]]);
    P.part(body, coat, { d: 5 });
    P.part(blob([[40, 52], [56, 52], [58, 64], [42, 64]]), o.cloth || "#3a6a3a", { d: 2 });
    leg(P, [34, 72], [32, 84], [32, 94], 7.6, coat, { paw: true, pawCol: "#2a2020" });
    leg(P, [68, 70], [72, 82], [72, 94], 7.6, coat, { paw: true, pawCol: "#2a2020" });
    /* 화살통 */
    P.part(rrect(54, 30, 7, 18, 2), "#7a4a2a", { d: 1, l: 0.6, lw: 1.3 });
    [[55, 30], [57.5, 28], [60, 30]].forEach(([x, y]) => P.part(poly([[x - 1.4, y], [x, y - 5], [x + 1.4, y]]), "#e8e0d0", { d: 0, l: 0, lw: 0.9 }));
    const torso = blob([[60, 58], [62, 40], [70, 32], [78, 36], [78, 52], [72, 60]]);
    P.part(torso, skin, { d: 3 });
    P.part(tube([[62, 36], [76, 52]], 3), "#6a3a20", { d: 0.4, l: 0.3, lw: 1.2 });
    P.part(blob([[66, 28], [64, 16], [72, 10], [80, 14], [82, 24], [78, 32], [70, 32]]), skin, { d: 2.4 });
    P.part(blob([[62, 30], [62, 14], [70, 6], [80, 8], [84, 16], [76, 12], [68, 16], [66, 34]]), o.hair || "#3a2418", { d: 1.8 });
    P.eye(77, 20, 2.4, { type: "angry", iris: "#2a6a3a" });
    /* 활 */
    const bow = new Path2D();
    bow.moveTo(90, 12);
    bow.quadraticCurveTo(104, 34, 90, 56);
    P.g.lineWidth = P.px(3.4);
    P.g.strokeStyle = "#2a1a10";
    P.g.stroke(bow);
    P.g.lineWidth = P.px(2);
    P.g.strokeStyle = "#a8743a";
    P.g.stroke(bow);
    P.stroke([[90, 12], [76, 34], [90, 56]], "#f0e8d8", 1);
    P.part(tube([[74, 34], [98, 33]], 1.6), "#8a5a30", { d: 0, l: 0, lw: 1 });
    P.part(poly([[98, 30.6], [103, 33], [98, 35.4]]), "#d8dce4", { d: 0, l: 0, lw: 1 });
    P.part(tube([[72, 38], [82, 34], [92, 34]], [5, 4.4, 4]), skin, { d: 0.8 });
    P.part(tube([[70, 40], [74, 36], [76, 34]], [5, 4.4, 4]), skin, { d: 0.8 });
  };

  /* 기사: dark(검은 갑옷) · cursed(빈 갑옷과 녹색 불꽃) · specter(망령 기사단장) · dullahan(목 없는 기사) · death(해골 투구) · doom(금빛과 불꽃 검) */
  KINDS.knight = (P, o) => {
    const armor = o.c1;
    const trim = o.c2 || "#c8a040";
    const fire = o.fire || "#60e0ff";
    const t = o.type || "dark";
    if (o.cape) P.part(blob([[34, 34], [24, 60], [18, 94], [42, 90], [60, 40]]), o.cape, { d: 4, l: 1.6 });
    if (t === "specter" && o.banner) {
      P.part(tube([[26, 94], [26, 10]], 2.6), "#5a4a3a", { d: 0.6, l: 0.4, lw: 1.3 });
      P.part(poly([[27, 12], [10, 14], [12, 30], [8, 44], [27, 38]]), "#3a4a8a", { d: 2, l: 1 });
      P.part(ell(18, 26, 3.6, 3.6), "#c8d8f0", { d: 0.6, l: 0.4, lw: 1.1 });
    }
    leg(P, [44, 70], [40, 82], [38, 94], 11, dark(armor, 0.4), { paw: true, pawCol: dark(armor, 0.6) });
    P.part(tube([[38, 40], [30, 54], [28, 66]], [10, 9, 8]), dark(armor, 0.4), { d: 2 });
    if (t !== "dullahan") P.shield(26, 62, 11, o.shield || dark(armor, 0.2), { inner: trim, boss: o.emblem || "#e03030" });
    else {
      /* 옆구리에 낀 자기 머리 */
      P.part(blob([[16, 56], [18, 46], [28, 44], [34, 52], [32, 62], [22, 64]]), armor, { d: 2.4 });
      P.part(rrect(20, 52, 12, 3, 1), "#0a0812", { d: 0, l: 0, lw: 1.2 });
      P.eye(26, 53.6, 1.6, { type: "glow", iris: fire });
    }
    const torso = blob([[34, 38], [52, 30], [66, 36], [70, 52], [64, 70], [42, 72], [34, 56]]);
    P.part(torso, armor, { d: 5, l: 2 });
    P.stroke([[52, 34], [52, 66]], trim, 1.6);
    P.part(blob([[38, 60], [66, 58], [70, 74], [54, 82], [38, 76]]), dark(armor, 0.3), { d: 2.4 });
    P.part(tube([[38, 61], [66, 59]], 3.6), trim, { d: 0.6, l: 0.4, lw: 1.3 });
    leg(P, [58, 72], [62, 84], [62, 94], 11, armor, { paw: true, pawCol: dark(armor, 0.4) });
    /* 어깨 갑옷 */
    P.part(blob([[56, 30], [72, 28], [80, 38], [72, 46], [58, 42]]), armor, { d: 2.4, l: 1.4 });
    P.stroke([[58, 38], [76, 36]], trim, 1.4);
    if (t === "cursed") {
      [[60, 70], [40, 62], [74, 46]].forEach(([x, y]) => { P.part(blob([[x - 3, y + 2], [x, y - 7], [x + 3, y + 2]]), "#80ff80", { d: 0.4, l: 0.6, lw: 1 }); P.glow(x, y, 9, "#60ff60", 0.5); });
      P.stroke([[36, 50], [44, 58], [40, 66]], "#7a5a3a", 1.4);
    }
    /* 머리 */
    if (t === "dullahan") {
      P.part(blob([[44, 30], [48, 24], [58, 24], [62, 30]]), dark(armor, 0.4), { d: 1 });
      [[48, 22], [53, 16], [58, 22]].forEach(([x, y], k) => P.part(blob([[x - 3, y + 6], [x, y - 6 - k], [x + 3, y + 6]]), k % 2 ? "#c0f0ff" : fire, { d: 0.6, l: 0.6, lw: 1.1 }));
      P.glow(53, 22, 18, fire, 0.55);
    } else {
      const helm = blob([[42, 28], [44, 12], [54, 6], [64, 10], [68, 22], [66, 32], [54, 36], [44, 34]]);
      if (t === "death") {
        P.part(helm, armor, { d: 3 });
        P.part(blob([[50, 16], [64, 14], [66, 28], [58, 34], [50, 30]]), "#e8e0c8", { d: 1.6, l: 0.6 });
        P.fill(ell(55, 22, 2.6, 2.8), "#0a0812");
        P.fill(ell(62, 22, 2.2, 2.6), "#0a0812");
        P.eye(55, 22, 1.4, { type: "glow", iris: fire });
        P.eye(62, 22, 1.2, { type: "glow", iris: fire });
        for (let k = 0; k < 3; k++) P.stroke([[54 + k * 3, 29], [54 + k * 3, 32]], "#3a3028", 0.9);
      } else {
        P.part(helm, armor, { d: 3 });
        P.part(rrect(52, 18, 15, 4, 1.4), "#0a0812", { d: 0, l: 0, lw: 1.2 });
        P.eye(60, 20, 1.8, { type: "glow", iris: fire, squint: true });
        P.stroke([[54, 8], [54, 34]], trim, 1.2);
      }
      if (o.horns) {
        P.horn(46, 14, 14, -150, 50, 4.6, o.horns, {});
        P.horn(60, 10, 14, -70, -40, 4.6, o.horns, {});
      }
      if (o.plume) P.part(blob([[50, 8], [44, -2], [36, 0], [30, 8], [42, 6]]), o.plume, { d: 1.4, l: 1 });
      if (o.crownCol) P.crown(55, 8, 16, 9, o.crownCol, "#e02040");
    }
    /* 앞팔과 검 */
    const hand = [76, 56];
    P.blade(hand[0], hand[1], o.great ? 50 : 40, -70, { w: o.great ? 6 : 4.4, col: o.bladeCol || "#c8d0dc", guard: trim, grip: "#3a2a24" });
    if (o.bladeGlow) {
      const tip = pol(hand[0], hand[1], o.great ? 44 : 34, -70);
      P.glow(tip[0], tip[1], 20, o.bladeGlow, 0.5);
      P.glow((hand[0] + tip[0]) / 2, (hand[1] + tip[1]) / 2, 22, o.bladeGlow, 0.4);
    }
    P.part(tube([[64, 38], [72, 48], hand], [10, 9, 8]), armor, { d: 1.6 });
    P.part(ell(hand[0], hand[1], 5, 4.6), dark(armor, 0.2), { d: 1, lw: 1.5 });
    if (t === "specter") P.glow(50, 50, 46, "#80c0ff", 0.25);
  };

  /* 마녀·여왕·리치: 고깔모자·로브·지팡이. swamp(가마솥) · queen(얼음 왕관과 드레스) · blizzard · lich(해골 마법사 왕) */
  KINDS.witch = (P, o) => {
    const robe = o.c1;
    const skin = o.skin || "#9ac87a";
    const t = o.type || "swamp";
    const orb = o.orb || "#a0ff60";
    if (t === "swamp") {
      P.part(blob([[2, 78], [4, 72], [26, 72], [28, 78], [24, 94], [6, 94]]), "#2a2a34", { d: 2.4, l: 1 });
      P.part(ell(15, 73, 12, 3.4), "#80e050", { d: 1, l: 0.6, lw: 1.4 });
      [[10, 66, 2.4], [18, 62, 1.8], [14, 56, 1.4]].forEach(([x, y, r]) => P.part(ell(x, y, r, r), "#a0f070", { d: 0.4, l: 0.4, lw: 1 }));
      P.glow(15, 70, 16, "#80ff60", 0.45);
    }
    if (t === "lich") P.glow(50, 50, 48, "#a060ff", 0.3);
    if (t === "queen" || t === "blizzard") P.glow(50, 50, 46, "#80e0ff", 0.3);
    const gown = t === "queen"
      ? blob([[38, 40], [60, 38], [70, 64], [86, 94], [18, 94], [32, 64]])
      : blob([[38, 40], [60, 38], [68, 64], [72, 94], [28, 94], [32, 64]]);
    P.part(gown, robe, { d: 5, l: 2 });
    if (t === "lich") for (let k = 0; k < 5; k++) P.part(poly([[30 + k * 10, 92], [34 + k * 10, 100 - (k % 2) * 3], [38 + k * 10, 92]]), dark(robe, 0.6), { d: 0.4, l: 0.3, lw: 1.1 });
    P.inside(gown, poly([[48, 40], [54, 40], [60, 94], [42, 94]]), o.c2 || dark(robe, 0.7));
    if (t === "queen") [[30, 80], [50, 86], [70, 80], [40, 66], [60, 66]].forEach(([x, y]) => P.part(poly([[x, y - 4], [x + 2.6, y], [x, y + 4], [x - 2.6, y]]), "#e0f8ff", { d: 0, l: 0, lw: 0.9 }));
    P.part(tube([[40, 44], [30, 56], [28, 64]], [7, 6, 5.4]), dark(robe, 0.5), { d: 1.2 });
    /* 머리와 머리카락 */
    const hairCol = o.hair || (t === "queen" ? "#e8f8ff" : t === "blizzard" ? "#a8d8f8" : "#3a3a2a");
    if (t !== "lich") P.part(blob([[38, 26], [40, 40], [36, 56], [44, 50], [48, 36], [60, 36], [66, 48], [68, 30], [62, 18], [46, 16]]), hairCol, { d: 2.4 });
    const head = t === "lich" ? blob([[44, 28], [46, 16], [58, 14], [66, 22], [64, 32], [58, 38], [48, 36]]) : blob([[44, 28], [46, 18], [56, 14], [66, 20], [66, 30], [58, 38], [48, 36]]);
    P.part(head, t === "lich" ? "#e8e0c8" : skin, { d: 2.6 });
    if (t === "swamp") {
      P.part(blob([[62, 24], [72, 30], [66, 33], [62, 30]]), light(skin, 0.2), { d: 0.6, l: 0.4, lw: 1.3 });
      P.fill(ell(68, 29, 1, 1), dark(skin, 1));
      P.eye(59, 24, 2.4, { type: "round", iris: "#e8e030", brow: true });
      P.stroke([[56, 33], [60, 34], [63, 32]], "#3a2a1a", 1.3);
      P.teeth(57, 33.4, 59.4, 33.8, 1, 1.6, "#f0e0a0");
    } else if (t === "lich") {
      P.fill(ell(54, 24, 3, 3.4), "#0a0812");
      P.fill(ell(61.6, 24, 2.6, 3), "#0a0812");
      P.eye(54, 24, 1.6, { type: "glow", iris: o.iris || "#c070ff" });
      P.eye(61.6, 24, 1.4, { type: "glow", iris: o.iris || "#c070ff" });
      P.part(rrect(52, 31, 11, 5, 1.4), "#e8e0c8", { d: 0.6, l: 0, lw: 1.2 });
      for (let k = 0; k < 4; k++) P.stroke([[53.5 + k * 2.6, 31.5], [53.5 + k * 2.6, 35.5]], "#3a3028", 0.8);
    } else {
      P.eye(59, 24, 2.6, { type: "round", iris: o.iris || "#40c8ff" });
      P.stroke([[57, 32], [60, 33], [63, 31]], "#a04a6a", 1.2);
    }
    /* 모자·왕관 */
    if (t === "swamp" || t === "blizzard") {
      const hatCol = o.hat || (t === "blizzard" ? "#2a4a8a" : "#2a3a2a");
      P.part(ell(53, 18, 20, 4.4, -0.1), hatCol, { d: 1.4, l: 0.8 });
      P.part(blob([[42, 17], [48, 6], [54, -2], [66, -6], [60, 2], [62, 16]]), hatCol, { d: 2, l: 1 });
      P.part(tube([[43, 15], [62, 13]], 2.6), t === "blizzard" ? "#ffffff" : "#8a3aa0", { d: 0.4, l: 0.4, lw: 1.2 });
      if (t === "blizzard") P.part(ell(33, 17, 3, 3), "#ffffff", { d: 0.4, l: 0, lw: 1 });
      else P.part(rrect(52, 11.4, 4, 3, 0.6), "#e0c040", { d: 0, l: 0, lw: 1 });
    } else if (t === "queen") {
      const cr = new Path2D();
      [[42, 16], [44, 2], [48, 12], [52, -4], [56, 10], [60, 0], [62, 16]].forEach(([x, y], i) => (i ? cr.lineTo(x, y) : cr.moveTo(x, y)));
      cr.closePath();
      P.part(cr, "#c8f4ff", { d: 1.2, l: 1, lw: 1.4 });
    } else if (t === "lich") {
      P.part(blob([[36, 40], [36, 20], [46, 8], [60, 8], [70, 18], [70, 30], [62, 18], [48, 20], [44, 42]]), robe, { d: 2.4 });
      P.crown(54, 14, 16, 10, "#d8b040", "#a020e0");
    }
    /* 지팡이 */
    P.staff(74, 60, 52, -86, orb, { skull: t === "lich", wood: t === "queen" ? "#a8d8f0" : t === "lich" ? "#3a2a3a" : "#6a4428" });
    P.part(tube([[60, 44], [70, 52], [74, 60]], [6, 5.4, 4.6]), robe, { d: 1 });
    P.part(ell(74, 60, 3.2, 3), t === "lich" ? "#e8e0c8" : skin, { d: 0.6, lw: 1.3 });
    if (t === "lich") {
      P.part(poly([[22, 30], [26, 22], [30, 30], [26, 38]]), "#a060ff", { d: 0.8, l: 0.8, lw: 1.2 });
      P.glow(26, 30, 12, "#c080ff", 0.6);
    }
    if (t === "blizzard" || t === "queen") [[16, 30], [86, 22], [12, 60], [90, 70]].forEach(([x, y]) => { P.stroke([[x - 3, y], [x + 3, y]], "#ffffff", 1.2); P.stroke([[x, y - 3], [x, y + 3]], "#ffffff", 1.2); P.stroke([[x - 2, y - 2], [x + 2, y + 2]], "#ffffff", 0.8); });
  };

  /* 미믹: 이빨 달린 보물 상자, 혀, 눈. king은 금 상자·보석·동전·왕관 */
  KINDS.mimic = (P, o) => {
    const wood = o.c1;
    const metal = o.c2 || "#c8a040";
    const king = o.king;
    if (king) [[16, 92], [24, 94], [82, 93], [88, 90], [76, 95]].forEach(([x, y]) => P.part(ell(x, y, 3.6, 2), "#f0c840", { d: 0.6, l: 0.4, lw: 1.1 }));
    leg(P, [34, 86], [30, 90], [28, 95], 6, dark(wood, 0.5), { paw: true, claws: "#e8e0d0" });
    leg(P, [66, 86], [70, 90], [72, 95], 6, wood, { paw: true, claws: "#e8e0d0" });
    /* 뚜껑(열려서 뒤로 젖혀짐) */
    const lid = blob([[24, 50], [26, 30], [40, 20], [62, 20], [76, 30], [78, 50]]);
    P.part(lid, wood, { d: 4, l: 2 });
    P.part(tube([[26, 48], [76, 48]], 4), metal, { d: 0.8, l: 0.5, lw: 1.4 });
    P.part(tube([[50, 21], [50, 48]], 5), metal, { d: 0.8, l: 0.5, lw: 1.4 });
    /* 입 속 */
    P.part(blob([[24, 50], [78, 50], [78, 62], [24, 62]]), "#3a0a18", { d: 0, l: 0, lw: 1.6 });
    P.teeth(26, 50, 76, 50, 9, 5);
    P.teeth(26, 62, 76, 62, 8, -4.4);
    P.part(tube([[52, 60], [62, 64], [70, 72], [80, 74]], [6, 5.6, 5, 4]), "#e05a7a", { d: 1, l: 0.6, lw: 1.3 });
    P.eye(42, 56, 2.4, { type: "glow", iris: o.iris || "#ffe040" });
    P.eye(58, 56, 2.4, { type: "glow", iris: o.iris || "#ffe040" });
    /* 상자 몸 */
    const box = rrect(22, 60, 58, 28, 3);
    P.part(box, wood, { d: 4 });
    P.part(tube([[22, 74], [80, 74]], 3.6), metal, { d: 0.8, l: 0.5, lw: 1.3 });
    [[24, 62], [78, 62], [24, 86], [78, 86]].forEach(([x, y]) => P.part(rrect(x - 3, y - 3, 6, 6, 1), metal, { d: 0.6, l: 0.4, lw: 1.2 }));
    P.part(rrect(46, 68, 10, 12, 2), metal, { d: 1, l: 0.6, lw: 1.3 });
    P.fill(ell(51, 73, 1.4, 1.6), "#2a1a10");
    if (king) {
      [[34, 34, "#e02850"], [50, 28, "#40c0ff"], [66, 34, "#40e080"]].forEach(([x, y, c]) => { P.part(poly([[x, y - 4], [x + 3.4, y], [x, y + 4], [x - 3.4, y]]), c, { d: 0.6, l: 0.8, lw: 1.2 }); });
      P.crown(50, 20, 20, 12, "#f4c440", "#e02850");
      P.glow(50, 74, 30, "#ffd860", 0.3);
    }
    if (o.shy) {
      P.fill(ell(34, 58, 3, 1.4), "#ff8aa0");
      P.fill(ell(68, 58, 3, 1.4), "#ff8aa0");
    }
  };

  /* 사자형 짐승의 몸(키메라·만티코어 공용): 네 발, 갈기 머리 */
  function lionBody(P, c, mane, o) {
    leg(P, [30, 72], [26, 84], [24, 94], 10, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    leg(P, [62, 72], [64, 84], [62, 94], 10, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    const body = blob([[22, 70], [28, 54], [50, 50], [70, 50], [80, 62], [74, 76], [50, 80], [30, 80]]);
    P.part(body, c, { d: 5, l: 2 });
    P.inside(body, ell(52, 80, 22, 6), light(c, 0.8));
    leg(P, [36, 74], [34, 86], [34, 94], 11, c, { paw: true, claws: "#f0e8d0" });
    leg(P, [70, 72], [74, 84], [72, 94], 11, c, { paw: true, claws: "#f0e8d0" });
    const m = blob([[62, 50], [64, 30], [76, 22], [90, 26], [96, 40], [92, 56], [80, 64], [66, 62]]);
    P.part(m, mane, { d: 4, l: 2 });
    for (let k = 0; k < 6; k++) { const [x, y] = pol(80, 42, 20, 110 + k * 30); P.part(poly([[x - 3, y], pol(x, y, 7, 110 + k * 30), [x + 3, y]]), mane, { d: 0.6, l: 0.4, lw: 1.2 }); }
    const head = blob([[72, 34], [80, 28], [90, 32], [96, 42], [92, 52], [80, 54], [72, 46]]);
    P.part(head, c, { d: 3 });
    P.part(blob([[86, 44], [98, 42], [98, 50], [88, 52]]), light(c, 0.5), { d: 1.2, l: 0.6, lw: 1.5 });
    P.part(ell(97, 42, 2.4, 2), "#3a2020", { d: 0.4, l: 0.4, lw: 1.1 });
    P.stroke([[86, 50], [92, 52], [98, 50]], inkOf(c), 1.6);
    P.teeth(87, 50.4, 97, 50.2, 3, 2.6);
    P.eye(84, 37, 2.8, { type: "angry", iris: (o && o.iris) || "#ffd030" });
    P.part(poly([[76, 30], [74, 20], [82, 28]]), c, { d: 0.6, l: 0.4, lw: 1.3 });
  }

  /* 키메라: 사자 몸, 등에서 솟은 염소 머리, 뱀 꼬리, 불꽃 */
  KINDS.chimera = (P, o) => {
    const c = o.c1;
    P.part(tube([[24, 66], [12, 62], [6, 50], [12, 38]], [6, 5, 4.4, 4]), "#4a8a3a", { d: 1.2 });
    const snake = blob([[6, 38], [10, 30], [18, 30], [22, 36], [16, 42], [8, 42]]);
    P.part(snake, "#4a8a3a", { d: 1.6 });
    P.eye(15, 34, 1.6, { type: "slit", iris: "#ffe040" });
    P.part(tube([[22, 38], [26, 40], [24, 42]], [1, 0.6]), "#e04040", { d: 0, l: 0, lw: 0.8 });
    lionBody(P, c, o.c2 || "#c8402a", o);
    /* 염소 머리 */
    P.part(tube([[46, 54], [44, 42], [46, 32]], [10, 8, 7]), "#d8d0c0", { d: 1.6 });
    const goat = blob([[40, 30], [44, 20], [54, 20], [58, 30], [54, 38], [44, 38]]);
    P.part(goat, "#e0d8c8", { d: 2.4 });
    P.horn(44, 22, 16, -140, -80, 4, "#6a5a4a", { rings: true });
    P.horn(52, 20, 14, -100, 60, 4, "#6a5a4a", { rings: true });
    P.eye(52, 28, 2, { type: "glow", iris: "#ff6a20" });
    P.part(blob([[44, 36], [48, 44], [52, 38]]), "#e0d8c8", { d: 0.6, l: 0.4, lw: 1.2 });
    P.glow(98, 48, 14, "#ff8a20", 0.6);
    P.part(blob([[96, 46], [100, 42], [100, 54], [97, 52]]), "#ff8a20", { d: 0.4, l: 0.6, lw: 1.1 });
  };

  /* 만티코어: 사자 몸, 박쥐 날개, 위로 휜 전갈 꼬리 */
  KINDS.manticore = (P, o) => {
    const c = o.c1;
    P.batWing(46, 52, 42, -125, o.wing || "#6a2a2a", o.mem || "#4a1a1a", {});
    const segs = [[24, 66], [14, 56], [10, 42], [16, 28], [28, 22], [36, 26]];
    segs.forEach((pt, k) => { if (k) P.part(ell((pt[0] + segs[k - 1][0]) / 2, (pt[1] + segs[k - 1][1]) / 2, 6 - k * 0.5, 4.6 - k * 0.4, Math.atan2(pt[1] - segs[k - 1][1], pt[0] - segs[k - 1][0])), o.tail || "#5a3a20", { d: 1, l: 0.6, lw: 1.4 }); });
    P.part(poly([[34, 24], [46, 30], [36, 32]]), "#c8f040", { d: 0.6, l: 0.6, lw: 1.3 });
    P.glow(42, 29, 10, "#c8f040", 0.5);
    lionBody(P, c, o.c2 || "#7a2a1a", o);
  };

  /* 바실리스크: 땅을 기는 큰 도마뱀, 왕관 같은 볏, 돌로 만드는 눈빛 */
  KINDS.basilisk = (P, o) => {
    const c = o.c1;
    P.part(tube([[30, 76], [16, 80], [6, 74], [4, 62]], [14, 10, 6, 2]), c, { d: 2 });
    leg(P, [30, 78], [22, 84], [20, 94], 9, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    leg(P, [58, 78], [54, 86], [54, 94], 9, dark(c, 0.5), { paw: true, claws: "#f0e8d0" });
    const body = blob([[24, 78], [30, 64], [52, 60], [72, 62], [82, 72], [74, 84], [40, 86]]);
    P.part(body, c, { d: 5 });
    P.inside(body, ell(54, 86, 22, 5), o.c2 || "#d8c880");
    for (let k = 0; k < 6; k++) P.part(ell(32 + k * 8, 66 - Math.sin(k) * 1.6, 3.4, 2.6), dark(c, 0.5), { d: 0.6, l: 0.4, lw: 1.1 });
    [[40, 74], [52, 70], [64, 74]].forEach(([x, y]) => P.part(blob([[x - 4, y], [x, y - 3], [x + 4, y], [x, y + 3]]), "#a8a8a0", { d: 0.6, l: 0.4, lw: 1.1 }));
    leg(P, [38, 80], [34, 88], [34, 95], 10, c, { paw: true, claws: "#f0e8d0" });
    leg(P, [68, 78], [72, 88], [72, 95], 10, c, { paw: true, claws: "#f0e8d0" });
    const head = blob([[70, 54], [80, 46], [94, 50], [100, 60], [92, 68], [76, 68]]);
    P.part(head, c, { d: 3.4 });
    for (let k = 0; k < 5; k++) P.part(poly([[70 + k * 4, 52 - k * 0.4], [66 + k * 5, 34 + (k % 2) * 4], [76 + k * 4, 50 - k * 0.6]]), o.crest || "#e0b030", { d: 0.8, l: 0.6, lw: 1.3 });
    P.stroke([[84, 64], [92, 64], [99, 62]], inkOf(c), 1.6);
    P.teeth(85, 64.4, 98, 62.6, 4, 2);
    P.eye(86, 55, 3, { type: "glow", iris: o.iris || "#80ff60" });
    P.glow(88, 55, 22, o.iris || "#80ff60", 0.4);
  };

  /* 촉수: kraken(물보라에서 솟은 촉수) · abyss(공허의 문과 눈 달린 촉수) · baby(아기 문어) */
  KINDS.tentacle = (P, o) => {
    const c = o.c1;
    const suck = o.c2 || light(c, 0.8);
    if (o.baby) {
      for (let k = 0; k < 5; k++) P.part(tube([[34 + k * 8, 76], [30 + k * 9, 86], [36 + k * 8, 94]], [7, 5, 2.4]), k % 2 ? c : dark(c, 0.3), { d: 1 });
      const head = blob([[28, 74], [26, 52], [36, 36], [52, 32], [68, 38], [76, 54], [74, 76], [50, 80]]);
      P.part(head, c, { d: 5, l: 2 });
      P.eye(44, 60, 5, { type: "cute" });
      P.eye(62, 60, 5, { type: "cute" });
      P.fill(ell(38, 70, 4, 2), "#ff8aa8");
      P.fill(ell(70, 70, 4, 2), "#ff8aa8");
      P.stroke([[50, 70], [54, 73], [58, 70]], inkOf(c), 1.6);
      P.part(ell(42, 44, 5, 3, -0.4), light(c, 1), { flat: true, line: false });
      return;
    }
    const base = o.abyss ? "#140a24" : "#3a7ab8";
    if (o.abyss) {
      P.part(ell(50, 90, 44, 9), "#1a0a2e", { d: 2, l: 0, ink: "#c060ff" });
      P.inside(ell(50, 90, 44, 9), ell(50, 92, 34, 6), "#000000");
      P.glow(50, 90, 40, "#a040ff", 0.4);
    } else {
      P.part(blob([[4, 94], [10, 84], [22, 86], [30, 80], [44, 86], [60, 80], [74, 86], [88, 82], [98, 94]]), base, { d: 2, l: 1.2 });
      [[18, 80], [52, 76], [84, 78]].forEach(([x, y]) => P.part(ell(x, y, 4, 2.6), "#e8f4ff", { d: 0.4, l: 0.4, lw: 1.1 }));
    }
    const arms = o.abyss
      ? [[[22, 90], [16, 70], [24, 50], [16, 30], [22, 18]], [[50, 90], [56, 66], [46, 44], [54, 22], [48, 8]], [[78, 90], [86, 70], [76, 52], [86, 36], [80, 24]]]
      : [[[24, 88], [16, 66], [26, 46], [18, 26], [28, 14]], [[62, 86], [70, 64], [60, 42], [72, 24], [64, 10]]];
    arms.forEach((pts, k) => {
      const tb = tube(pts, [16, 14, 11, 7, 2.4]);
      P.part(tb, k % 2 ? c : dark(c, 0.3), { d: 3, l: 1.4 });
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i];
        P.part(ell(x + 3, y, 2.4 - i * 0.3, 2 - i * 0.25), suck, { d: 0.4, l: 0, lw: 1 });
      }
      if (o.abyss) P.eye(pts[2][0], pts[2][1], 3, { type: "glow", iris: "#ff3060" });
    });
    if (!o.abyss) P.eye(26, 46, 2.6, { type: "slit", iris: "#ffd040" });
  };

  /* 히드라: 뭉툭한 몸에서 솟은 다섯 개의 머리 */
  KINDS.hydra = (P, o) => {
    const c = o.c1;
    const belly = o.c2 || "#d8d088";
    P.part(tube([[26, 82], [12, 86], [4, 78]], [14, 8, 2]), c, { d: 2 });
    const body = blob([[18, 88], [24, 66], [50, 60], [76, 66], [84, 88], [50, 94]]);
    P.part(body, c, { d: 5, l: 2 });
    P.inside(body, ell(52, 92, 26, 6), belly);
    leg(P, [32, 84], [28, 90], [26, 95], 10, dark(c, 0.4), { paw: true, claws: "#f0e8d0" });
    leg(P, [70, 84], [74, 90], [74, 95], 10, c, { paw: true, claws: "#f0e8d0" });
    const heads = [[34, 64, 14, 36, 0.8], [44, 62, 30, 20, 0.9], [62, 62, 74, 18, 0.9], [72, 66, 90, 38, 0.8], [52, 60, 54, 10, 1.1]];
    heads.forEach(([x1, y1, x2, y2, s], k) => {
      const mid = [(x1 + x2) / 2 + (k % 2 ? 6 : -6), (y1 + y2) / 2];
      P.part(tube([[x1, y1], mid, [x2, y2]], [12 * s, 9 * s, 7 * s]), k === 4 ? c : dark(c, 0.25), { d: 2 });
      const dir = x2 >= 50 ? 1 : -1;
      const hx = x2;
      const hy = y2;
      const head = blob([[hx - 6 * s * dir, hy + 2], [hx - 4 * s * dir, hy - 6 * s], [hx + 6 * s * dir, hy - 6 * s], [hx + 14 * s * dir, hy - 1], [hx + 12 * s * dir, hy + 5 * s], [hx, hy + 6 * s]]);
      P.part(head, k === 4 ? c : dark(c, 0.25), { d: 2 });
      P.stroke([[hx + 4 * s * dir, hy + 3 * s], [hx + 13 * s * dir, hy + 2 * s]], inkOf(c), 1.4);
      P.teeth(hx + 5 * s * dir, hy + 3.2 * s, hx + 12 * s * dir, hy + 2.4 * s, 2, 1.8);
      P.eye(hx + 3 * s * dir, hy - 2 * s, 1.8 * s, { type: "glow", iris: o.iris || "#ffd030" });
      for (let i = 0; i < 3; i++) P.part(poly([[hx - (4 - i * 3) * s * dir, hy - 5 * s], [hx - (6 - i * 3) * s * dir, hy - 11 * s], [hx - (2 - i * 3) * s * dir, hy - 5.4 * s]]), o.crest || "#e0b030", { d: 0.4, l: 0.4, lw: 1 });
    });
  };

  /* 새: snow(눈꽃 새, 작고 둥글다) · phoenix(불꽃 날개와 긴 꼬리깃) */
  KINDS.bird = (P, o) => {
    const c = o.c1;
    if (o.phoenix) {
      P.glow(50, 46, 50, "#ff8a20", 0.4);
      [[30, 70, 10, 92], [36, 72, 24, 96], [42, 72, 40, 96]].forEach(([x1, y1, x2, y2], k) => P.part(tube([[x1, y1], [(x1 + x2) / 2 - 4, (y1 + y2) / 2], [x2, y2]], [5, 6, 2]), k % 2 ? "#ffd040" : "#ff6a1a", { d: 1, l: 0.8 }));
      P.featherWing(42, 46, 48, -150, "#ff6a1a", { n: 8, spread: 11, tip: "#ffd040" });
      const body = blob([[34, 62], [40, 44], [54, 40], [64, 50], [60, 68], [46, 74]]);
      P.part(body, c, { d: 4 });
      P.inside(body, ell(54, 62, 7, 8), "#ffe070");
      P.part(tube([[56, 46], [62, 32], [66, 24]], [10, 8, 7]), c, { d: 1.6 });
      const head = blob([[60, 22], [66, 14], [76, 16], [80, 24], [72, 30], [62, 30]]);
      P.part(head, c, { d: 2 });
      P.part(poly([[78, 20], [90, 24], [78, 28]]), "#ffd040", { d: 0.6, l: 0.4, lw: 1.3 });
      P.eye(71, 21, 2.2, { type: "glow", iris: "#fff6a0" });
      [[62, 14, 56, 2], [66, 12, 64, 0], [70, 13, 74, 2]].forEach(([x1, y1, x2, y2], k) => P.part(tube([[x1, y1], [x2, y2]], [3, 1]), k % 2 ? "#ffd040" : "#ff6a1a", { d: 0.4, l: 0.4, lw: 1.1 }));
      P.featherWing(56, 48, 46, -30, "#ff8a20", { n: 8, spread: 11, tip: "#ffe060" });
      P.part(tube([[48, 72], [46, 82]], 2.4), "#c8401a", { d: 0.4 });
      P.part(tube([[54, 72], [56, 82]], 2.4), "#c8401a", { d: 0.4 });
      return;
    }
    P.part(tube([[34, 70], [22, 74], [14, 72]], [8, 6, 3]), o.c2 || light(c, 0.3), { d: 1 });
    P.part(tube([[44, 78], [42, 90]], 2.4), "#e0a040", { d: 0.4, l: 0.3, lw: 1.1 });
    P.part(tube([[54, 78], [56, 90]], 2.4), "#e0a040", { d: 0.4, l: 0.3, lw: 1.1 });
    const body = ell(48, 62, 20, 18);
    P.part(body, c, { d: 4, l: 2 });
    P.inside(body, ell(54, 68, 11, 10), o.c2 || "#d8f0ff");
    P.featherWing(42, 58, 26, -170, o.c2 || "#a8d8f8", { n: 5, spread: 14 });
    P.eye(56, 54, 3, { type: "cute" });
    P.part(poly([[64, 56], [72, 59], [64, 62]]), "#f0b030", { d: 0.4, l: 0.4, lw: 1.2 });
    P.fill(ell(54, 61, 2.4, 1.4), "#ffa0b8");
    P.part(blob([[44, 46], [46, 36], [50, 44], [54, 38], [54, 46]]), o.c2 || "#a8d8f8", { d: 0.6, l: 0.4, lw: 1.2 });
    [[74, 40], [80, 52], [26, 44]].forEach(([x, y]) => { P.stroke([[x - 2.6, y], [x + 2.6, y]], "#ffffff", 1); P.stroke([[x, y - 2.6], [x, y + 2.6]], "#ffffff", 1); });
  };

  /* 대지렁이: 땅에서 솟은 마디진 몸, 둥근 입과 이빨 고리. glacier(얼음) · cosmic(별과 눈) */
  KINDS.worm = (P, o) => {
    const c = o.c1;
    const segs = [[40, 92, 26], [36, 78, 25], [38, 64, 24], [46, 50, 23], [58, 40, 22], [70, 34, 22]];
    P.part(blob([[4, 96], [14, 86], [30, 88], [52, 86], [70, 90], [90, 86], [98, 96]]), o.ground || "#4a3a2a", { d: 2, l: 1 });
    segs.forEach(([x, y, r], k) => {
      P.part(ell(x, y, r * 0.62, r * 0.42, -0.4 + k * 0.12), k % 2 ? c : dark(c, 0.25), { d: 3, l: 1.4 });
      if (o.glacier && k % 2) P.part(poly([[x - 3, y - r * 0.3], [x - 1, y - r * 0.3 - 9], [x + 3, y - r * 0.3]]), "#d8f4ff", { d: 0.4, l: 0.6, lw: 1.2 });
      if (o.cosmic) { P.fill(ell(x - 4, y - 2, 1.2, 1.2), "#ffffff"); P.fill(ell(x + 5, y + 3, 0.8, 0.8), "#ffe8a0"); }
      if (o.cosmic && k % 2 === 0 && k) P.eye(x + 2, y, 2.4, { type: "glow", iris: "#ff60e0" });
    });
    /* 입: 오른쪽을 향한 둥근 아가리 */
    const mx = 78;
    const my = 30;
    P.part(ell(mx, my, 12, 16, 0.2), o.lip || light(c, 0.4), { d: 2, l: 1 });
    P.part(ell(mx + 2, my, 8, 12, 0.2), "#2a0a14", { d: 0, l: 0, lw: 1.4 });
    for (let k = 0; k < 10; k++) {
      const [x, y] = pol(mx + 2, my, 8.4, k * 36);
      const [tx, ty] = pol(mx + 2, my, 4.6, k * 36);
      P.part(poly([pol(x, y, 1.8, k * 36 + 90), [tx, ty], pol(x, y, 1.8, k * 36 - 90)]), "#f4ecd0", { d: 0, l: 0, lw: 0.9 });
    }
    P.glow(mx + 2, my, 10, o.maw || "#ff6040", 0.5);
    if (o.cosmic) P.glow(50, 50, 50, "#a040ff", 0.3);
  };

  /* 상급 악마: 근육질 몸, 숫양 뿔, 박쥐 날개, 발굽, 불꽃 */
  KINDS.demon = (P, o) => {
    const c = o.c1;
    P.glow(50, 50, 50, "#ff4010", 0.3);
    P.batWing(40, 36, 52, -140, o.wing || "#3a0a10", o.mem || "#6a1018", {});
    P.part(tube([[36, 72], [20, 80], [12, 70], [14, 58]], [5, 4, 3, 2]), c, { d: 1 });
    P.part(poly([[10, 60], [14, 48], [19, 60]]), "#1a0a0a", { d: 0.4, l: 0.4, lw: 1.2 });
    leg(P, [42, 70], [36, 82], [38, 94], 13, dark(c, 0.5), { paw: true, pawCol: "#2a1a1a" });
    P.part(tube([[38, 38], [28, 50], [24, 62]], [12, 10, 9]), dark(c, 0.5), { d: 2 });
    const torso = blob([[32, 38], [50, 26], [68, 32], [76, 48], [70, 68], [50, 74], [34, 66], [28, 52]]);
    P.part(torso, c, { d: 6, l: 2 });
    P.stroke([[42, 42], [52, 46], [62, 42]], dark(c, 1.1), 1.6);
    P.stroke([[52, 50], [52, 64]], dark(c, 0.9), 1.2);
    P.part(blob([[34, 64], [70, 62], [72, 76], [52, 84], [36, 78]]), "#2a1418", { d: 2.4 });
    leg(P, [58, 72], [66, 82], [62, 94], 13, c, { paw: true, pawCol: "#2a1a1a" });
    const head = blob([[50, 22], [52, 10], [62, 6], [72, 12], [74, 22], [66, 30], [54, 30]]);
    P.part(head, c, { d: 3 });
    P.horn(52, 12, 24, -170, 120, 6, o.horn || "#3a2a2a", { rings: true });
    P.horn(66, 8, 18, -60, 80, 5, o.horn || "#3a2a2a", { rings: true });
    P.eye(66, 17, 2.8, { type: "glow", iris: "#ffe040" });
    P.part(blob([[62, 24], [74, 22], [72, 28], [64, 28]]), "#2a0a0a", { d: 0, l: 0, lw: 1.3 });
    P.teeth(62.6, 24.2, 73.4, 22.4, 3, 2);
    P.part(tube([[64, 36], [76, 44], [84, 40]], [11, 9, 8]), c, { d: 2 });
    const fist = [86, 38];
    P.part(ell(fist[0], fist[1], 5.4, 5), c, { d: 1, lw: 1.5 });
    [[84, 30], [88, 24], [92, 30], [88, 34]].forEach(([x, y], k) => P.part(blob([[x - 3, y + 4], [x, y - 6 - k], [x + 3, y + 4]]), k % 2 ? "#ffd040" : "#ff5a10", { d: 0.4, l: 0.6, lw: 1.1 }));
    P.glow(88, 30, 16, "#ff7020", 0.6);
  };

  /* 베헤모스: 땅을 울리는 거대한 짐승, 등판 갑각과 거대한 뿔 */
  KINDS.behemoth = (P, o) => {
    const c = o.c1;
    const plate = o.c2 || "#8a6a5a";
    leg(P, [26, 70], [22, 82], [22, 94], 14, dark(c, 0.5), { paw: true, pawCol: "#2a2020" });
    leg(P, [60, 72], [58, 84], [58, 94], 14, dark(c, 0.5), { paw: true, pawCol: "#2a2020" });
    P.part(tube([[16, 64], [6, 66], [4, 74]], [8, 6, 3]), c, { d: 1.4 });
    const body = blob([[14, 66], [20, 42], [44, 30], [70, 34], [86, 50], [84, 72], [60, 82], [26, 82]]);
    P.part(body, c, { d: 6, l: 2.4 });
    for (let k = 0; k < 4; k++) P.part(blob([[20 + k * 14, 46 - (k < 2 ? k * 4 : (3 - k) * 4)], [26 + k * 14, 30 - (k < 2 ? k * 4 : (3 - k) * 4)], [36 + k * 14, 34 - (k < 2 ? k * 4 : (3 - k) * 4)], [34 + k * 14, 50 - (k < 2 ? k * 4 : (3 - k) * 4)]]), plate, { d: 2, l: 1.2 });
    leg(P, [34, 74], [32, 86], [32, 94], 15, c, { paw: true, pawCol: "#2a2020" });
    leg(P, [70, 72], [74, 84], [72, 94], 15, c, { paw: true, pawCol: "#2a2020" });
    const head = blob([[70, 46], [80, 38], [94, 44], [100, 58], [94, 68], [80, 68], [72, 60]]);
    P.part(head, c, { d: 3.4 });
    P.horn(80, 42, 24, -100, 70, 7, o.horn || "#e8dcc0", { rings: true });
    P.horn(92, 50, 14, -40, -40, 6, o.horn || "#e8dcc0", {});
    P.part(tube([[86, 64], [96, 66], [100, 58]], [4, 3, 1.4]), "#f4ecd0", { d: 0.6, l: 0.4, lw: 1.3 });
    P.eye(84, 50, 2.8, { type: "glow", iris: o.iris || "#ffa030" });
    [[8, 92], [92, 94]].forEach(([x, y]) => P.part(poly([[x - 4, y], [x, y - 5], [x + 4, y]]), "#6a5a4a", { d: 0.4, l: 0.4, lw: 1.1 }));
  };

  /* 타락천사: 검은 깃털 날개, 금 간 고리, 빛의 창 */
  KINDS.angel = (P, o) => {
    const skin = o.skin || "#f0e0e0";
    P.glow(50, 44, 50, "#d0a0ff", 0.25);
    P.featherWing(44, 40, 48, -150, o.wing || "#2a2034", { n: 8, spread: 11, tip: o.wingTip || "#4a3a5a" });
    const robe = blob([[38, 40], [60, 38], [66, 62], [70, 92], [50, 86], [30, 92], [34, 62]]);
    P.part(robe, o.c1 || "#3a2a4a", { d: 5, l: 2 });
    P.inside(robe, poly([[48, 40], [54, 40], [58, 90], [44, 90]]), o.c2 || "#e0b040");
    P.part(blob([[36, 26], [36, 46], [32, 60], [42, 52], [46, 36], [60, 34], [64, 50], [66, 30], [58, 16], [44, 16]]), o.hair || "#f0f0f8", { d: 2.4 });
    const head = blob([[44, 28], [46, 18], [56, 14], [64, 20], [64, 30], [56, 36], [48, 34]]);
    P.part(head, skin, { d: 2.4 });
    P.eye(58, 24, 2.6, { type: "glow", iris: o.iris || "#c060ff" });
    P.stroke([[56, 31], [60, 31.6], [63, 30]], "#7a4a6a", 1.2);
    /* 금 간 고리 */
    const halo = new Path2D();
    halo.ellipse(54, 8, 12, 3.4, -0.1, 0.4, Math.PI * 1.7);
    P.g.lineWidth = P.px(4);
    P.g.strokeStyle = "#5a4a2a";
    P.g.stroke(halo);
    P.g.lineWidth = P.px(2.4);
    P.g.strokeStyle = "#f0d060";
    P.g.stroke(halo);
    P.glow(54, 8, 14, "#ffe070", 0.4);
    P.spear(74, 58, 52, -80, { col: "#fff8c0", shaft: "#e0c060" });
    P.glow(80, 14, 14, "#fff6a0", 0.6);
    P.part(tube([[60, 44], [70, 52], [74, 58]], [6, 5.4, 4.6]), o.c1 || "#3a2a4a", { d: 1 });
    P.part(ell(74, 58, 3.2, 3), skin, { d: 0.6, lw: 1.3 });
    P.featherWing(58, 44, 36, -40, o.wing || "#2a2034", { n: 6, spread: 12, tip: o.wingTip || "#4a3a5a" });
  };

  /* 혼돈의 마수: 여러 눈과 촉수 입, 짝이 안 맞는 다리 */
  KINDS.chaos = (P, o) => {
    const c = o.c1;
    const c2 = o.c2 || "#30e0e0";
    P.glow(50, 56, 48, "#c040ff", 0.3);
    leg(P, [30, 76], [20, 86], [22, 95], 9, dark(c2, 0.4), { paw: true, claws: "#f0e8d0" });
    P.part(tube([[60, 80], [72, 88], [80, 95]], [8, 6, 3]), dark(c, 0.4), { d: 1 });
    const body = blob([[16, 70], [22, 46], [40, 30], [62, 30], [80, 42], [86, 62], [74, 80], [46, 86], [24, 84]]);
    P.part(body, c, { d: 6, l: 2.4 });
    P.inside(body, blob([[20, 60], [34, 50], [42, 64], [30, 78]]), c2, { part: true, d: 1.4, l: 0.6 });
    P.inside(body, blob([[56, 34], [72, 36], [70, 50], [58, 48]]), c2, { part: true, d: 1.4, l: 0.6 });
    [[36, 44, 4], [52, 40, 5], [66, 52, 3.4], [30, 62, 3], [48, 58, 6]].forEach(([x, y, r], k) => P.eye(x, y, r, { type: k === 4 ? "slit" : "round", iris: k % 2 ? "#ff3060" : "#ffe040", look: r * 0.3 }));
    P.part(blob([[66, 64], [84, 62], [86, 74], [70, 76]]), "#2a0a20", { d: 0, l: 0, lw: 1.4 });
    P.teeth(67, 64.4, 83, 62.6, 5, 2.4);
    [[84, 66, 96, 56], [84, 70, 98, 72], [80, 74, 90, 84]].forEach(([x1, y1, x2, y2]) => P.part(tube([[x1, y1], [(x1 + x2) / 2, (y1 + y2) / 2 + 3], [x2, y2]], [3.4, 2.6, 1]), "#e04a8a", { d: 0.6, l: 0.4, lw: 1.2 }));
    leg(P, [44, 80], [40, 88], [40, 95], 11, c, { paw: true, claws: "#f0e8d0" });
    leg(P, [66, 78], [70, 88], [66, 95], 10, c2, { paw: true, claws: "#f0e8d0" });
    P.horn(40, 32, 14, -110, -30, 4.4, "#e8e0d0", {});
    P.horn(60, 30, 16, -60, 50, 4.4, "#2a2030", {});
  };

  /* 마왕의 그림자: 거대한 망토 그림자, 뿔 달린 왕관, 붉은 눈, 그림자 손 */
  KINDS.kingshadow = (P, o) => {
    P.glow(50, 50, 52, "#7a20c0", 0.35);
    for (let k = 0; k < 7; k++) P.fill(ell(10 + k * 14, 92 - (k % 2) * 3, 12, 5), "rgba(30,10,50,0.7)");
    const cloak = blob([[22, 94], [24, 60], [30, 36], [42, 22], [62, 20], [76, 34], [82, 60], [86, 94], [70, 86], [54, 96], [38, 86]]);
    P.part(cloak, o.c1 || "#1a1024", { d: 6, l: 2, ink: "#a050ff" });
    P.inside(cloak, blob([[40, 30], [64, 28], [72, 52], [64, 90], [42, 90], [34, 52]]), "#0a0612");
    P.part(blob([[30, 36], [24, 28], [36, 26], [44, 34]]), o.c1 || "#1a1024", { d: 1.4, ink: "#a050ff" });
    P.part(blob([[74, 34], [82, 26], [72, 24], [64, 32]]), o.c1 || "#1a1024", { d: 1.4, ink: "#a050ff" });
    P.eye(48, 40, 3.6, { type: "glow", iris: "#ff2a2a", squint: true });
    P.eye(62, 40, 3.6, { type: "glow", iris: "#ff2a2a", squint: true });
    P.part(blob([[48, 50], [62, 50], [58, 56], [52, 56]]), "#000000", { d: 0, l: 0, lw: 1.2, ink: "#ff4a4a" });
    /* 뿔 왕관 */
    P.horn(42, 26, 22, -130, -40, 6, "#2a1a30", { rings: true, ink: "#a050ff" });
    P.horn(66, 24, 22, -50, 40, 6, "#2a1a30", { rings: true, ink: "#a050ff" });
    P.part(poly([[42, 26], [46, 14], [50, 22], [55, 10], [60, 22], [64, 14], [68, 26]]), "#c8a040", { d: 1, l: 0.8, lw: 1.4 });
    P.part(ell(55, 22, 2.2, 2.2), "#ff2a4a", { d: 0.4, l: 0.4, lw: 1 });
    /* 그림자 손 */
    [[86, 50], [14, 54]].forEach(([x, y], k) => {
      P.part(tube([[k ? 26 : 76, 52], [x, y]], [9, 6]), "#1a1024", { d: 1, ink: "#a050ff" });
      for (let f = 0; f < 4; f++) P.part(tube([[x, y], pol(x, y, 8, (k ? 180 : 0) - 50 + f * 26)], [2.4, 1]), "#1a1024", { d: 0, l: 0, lw: 1.2, ink: "#a050ff" });
    });
    P.glow(55, 40, 18, "#ff2a2a", 0.4);
  };

  /* 공허의 군주: 거대한 하나의 눈, 가시 왕관, 늘어진 촉수 */
  KINDS.voidlord = (P, o) => {
    const c = o.c1;
    P.glow(50, 46, 52, "#a040ff", 0.4);
    for (let k = 0; k < 6; k++) {
      const x = 22 + k * 11;
      P.part(tube([[x, 60], [x + (k % 2 ? 6 : -6), 76], [x + (k % 2 ? -2 : 4), 92]], [8, 6, 2]), k % 2 ? c : dark(c, 0.4), { d: 1.4 });
    }
    const body = ell(50, 44, 34, 30);
    P.part(body, c, { d: 6, l: 2.4 });
    for (let k = 0; k < 9; k++) {
      const a = -160 + k * 17.5;
      const [x, y] = pol(50, 44, 30, a);
      const [tx, ty] = pol(50, 44, 44 + (k % 2) * 6, a);
      P.part(poly([pol(x, y, 4, a + 90), [tx, ty], pol(x, y, 4, a - 90)]), k % 2 ? "#e8c050" : light(c, 0.6), { d: 0.8, l: 0.6, lw: 1.3 });
    }
    /* 눈꺼풀과 큰 눈 */
    P.part(ell(52, 46, 24, 16), "#2a0a30", { d: 1, l: 0, lw: 2 });
    P.part(ell(52, 46, 20, 13), "#f4e8f0", { d: 2.4, l: 0, lw: 1.6 });
    P.fill(ell(56, 46, 10, 11), "#c020c0");
    P.fill(ell(56, 46, 6, 8), "#ff60ff");
    P.fill(ell(56, 46, 2.4, 8), "#100010");
    P.fill(ell(52, 41, 3, 2.4), "#ffffff");
    P.glow(56, 46, 18, "#ff60ff", 0.5);
    [[20, 20], [84, 18], [12, 52], [90, 60]].forEach(([x, y]) => P.part(poly([[x, y - 4], [x + 2, y], [x, y + 4], [x - 2, y]]), "#e0a0ff", { d: 0, l: 0, lw: 1 }));
  };

  /* ── 이름 → 그림 ──
     c1 주색, c2 보조색, c3 셋째 색. 보스는 크게, 왕관·빛 같은 표시를 더한다 */
  const ART = {
    "슬라임": ["slime", { c1: "#58c850" }],
    "아기 슬라임": ["slime", { c1: "#9be37f", size: 0.72, blush: true }],
    "거대 슬라임 왕": ["slime", { c1: "#4aa8f0", king: true, angry: true, bubbles: true, size: 1.12 }],
    "눈덩이 슬라임": ["slime", { c1: "#f4f8ff", c2: "#e04040", snow: true, size: 0.9 }],
    "고블린": ["goblin", { c1: "#6ab84a", c2: "#8a5a32", weapon: "club" }],
    "코볼트 광부": ["goblin", { c1: "#c08a5a", c2: "#4a5a6a", weapon: "pick", helmet: "miner", ears: 0.6, sack: true }],
    "고블린 족장": ["goblin", { c1: "#4a8a3a", c2: "#a02a2a", weapon: "axe", helmet: "bone", cape: "#6a4a2a", armor: "#7a6a5a", big: true }],
    "칼날 고블린": ["goblin", { c1: "#8a3a3a", c2: "#2a2a34", weapon: "twin", hood: "#2a2a34", iris: "#ff4040" }],
    "그렘린": ["goblin", { c1: "#3aa0a0", c2: "#3a4a5a", weapon: "wrench", ears: 1.3, iris: "#f0f040", eyeType: "slit" }],
    "거대 쥐": ["rat", { c1: "#8a8a98", c3: "#e0a0a8" }],
    "굶주린 늑대": ["wolf", { c1: "#7a7a88", c2: "#c8c8d0" }],
    "그림자 늑대": ["wolf", { c1: "#2a2a4a", c2: "#4a3a6a", glowEye: true, iris: "#c060ff", smoke: true }],
    "늑대 우두머리": ["wolf", { c1: "#9a9aa8", c2: "#e8e8f0", mane: "#e8e8f0", scar: true, iris: "#ff5040" }],
    "달빛 늑대왕": ["wolf", { c1: "#8aa0d8", c2: "#f0f4ff", mane: "#f4f6ff", crown: "#f4d860", moon: true, glowEye: true, iris: "#a0e8ff" }],
    "서리 늑대": ["wolf", { c1: "#d8eaf4", c2: "#ffffff", mane: "#b8e0f0", frost: true, glowEye: true, iris: "#60d8ff" }],
    "흡혈 박쥐": ["bat", { c1: "#6a3a8a", c2: "#4a2060" }],
    "피의 박쥐": ["bat", { c1: "#8a1a2a", c2: "#5a0a18", iris: "#ffd040", blood: true }],
    "독버섯 괴물": ["mushroom", { c1: "#d83a3a" }],
    "졸린 버섯돌이": ["mushroom", { c1: "#5a9ae0", sleepy: true }],
    "해골 병사": ["skeleton", { c2: "#6a4a3a" }],
    "해골 마법사": ["skeleton", { mage: true, c2: "#2a3060", orb: "#60e0ff" }],
    "성난 멧돼지": ["boar", { c1: "#7a5032", c2: "#a8805a", steam: true }],
    "산적": ["bandit", { c1: "#6a5a3a", c2: "#5a2a2a", scar: true }],
    "솜털 토끼": ["rabbit", { c1: "#f8f4f0" }],
    "독침 임프": ["imp", { c1: "#8a4ab0", c2: "#5a2a7a", stinger: true }],
    "나락의 임프": ["imp", { c1: "#2a1a24", c2: "#5a1010", horn: "#ffd040", iris: "#ff3a1a", fire: true, fork: "#ffb030" }],
    "임프 대공": ["imp", { c1: "#c8302a", c2: "#3a1018", duke: true, iris: "#ffe040", fire: true }],
    "숲의 고목왕": ["treant", { c1: "#6a4a2e", c2: "#3a8a3a", king: true }],
    "오크 전사": ["brute", { c1: "#5a8a3a", c2: "#6a4a2a", head: "orc", weapon: "axe", armor: "plate", bracer: "#5a4030" }],
    "오크 대족장": ["brute", { c1: "#3a6a2a", c2: "#7a1a1a", head: "orc", weapon: "greataxe", armor: "spiked", cape: "#4a2a1a", scar: true, hair: "#c8c8c8", bracer: "#8a6a2a", iris: "#ff4030" }],
    "트롤": ["brute", { c1: "#5f8fa3", c2: "#5a4a2a", head: "troll", weapon: "club", fat: true, hair: "#4a6a3a" }],
    "오우거": ["brute", { c1: "#d8a070", c2: "#6a3a20", head: "ogre", weapon: "club", spikes: true, fat: true, clubCol: "#6a4a30" }],
    "미노타우로스": ["brute", { c1: "#7a4a2a", c2: "#8a1a1a", head: "bull", weapon: "axe", bracer: "#5a4030", pants: "#3a2a20" }],
    "미궁의 황소왕": ["brute", { c1: "#5a1a14", c2: "#1a1a24", head: "bull", weapon: "greataxe", armor: "spiked", metal: "#c8a040", cape: "#3a1a40", horn: "#f8e8a8", boss: true, iris: "#ffd040", crownCol: null, bracer: "#c8a040" }],
    "화염 거인": ["brute", { c1: "#8a3a2a", c2: "#5a1a10", head: "giant", element: "fire", weapon: "hammer", armor: "plate", metal: "#5a5058", hammerCol: "#3a3038" }],
    "서리 거인": ["brute", { c1: "#6a98c0", c2: "#2a4a7a", head: "giant", element: "ice", weapon: "axe", armor: "plate", metal: "#c8e8f8", pants: "#3a5a8a" }],
    "폭풍 거인": ["brute", { c1: "#7a8aa8", c2: "#1a2a5a", head: "giant", element: "storm", weapon: "hammer", armor: "plate", metal: "#e0c040", hammerCol: "#a8b0c0" }],
    "거대 거미": ["spider", { c1: "#3a3a5a", c3: "#e03030" }],
    "거미 여왕": ["spider", { c1: "#4a1a5a", c3: "#ffd040", queen: true, skin: "#c8a8d8" }],
    "썩은 좀비": ["zombie", { c1: "#8aa37a", c2: "#5a4a6a", flies: true }],
    "하피": ["harpy", { c1: "#8a6ab0", c2: "#d8c8f0", legCol: "#e0b040" }],
    "광기의 하피": ["harpy", { c1: "#a82a2a", c2: "#ffb060", hair: "#3a0a10", wild: true, iris: "#fff040" }],
    "리자드맨 전사": ["lizard", { c1: "#4a9a4a", c2: "#e8d890" }],
    "늑대인간": ["werewolf", { c1: "#6a4a32" }],
    "화염 정령": ["wisp", { type: "fire" }],
    "얼음 정령": ["wisp", { type: "ice", c1: "#7ad8ff" }],
    "눈보라 정령": ["wisp", { type: "blizzard", c1: "#c8ecff" }],
    "촛불 도깨비": ["wisp", { type: "candle" }],
    "떠도는 별똥 정령": ["wisp", { type: "star" }],
    "원한의 망령": ["ghost", { c1: "#c0c8e0", chains: true }],
    "꼬마 요정": ["fairy", { c1: "#60c060" }],
    "철갑 집게": ["crab", { c1: "#b0603a", style: "iron" }],
    "얼음 집게": ["crab", { c1: "#78b8e0", c2: "#e0f4ff", style: "ice" }],
    "공허 집게": ["crab", { c1: "#5a2a8a", c2: "#a080d0", style: "void", glowEye: "#ff60e0" }],
    "식인 꽃의 여왕": ["flower", { c1: "#f0c030", c2: "#c02a6a", queen: true }],
    "가고일": ["gargoyle", { c1: "#8a8a98" }],
    "와이번": ["dragon", { c1: "#3a8a4a", c2: "#d8d088", wyvern: true, mem: "#2a5a3a" }],
    "그림자 용": ["dragon", { c1: "#2a2a5a", c2: "#6a4aa0", mem: "#3a1a5a", spine: "#8a5ad8", glowEye: true, iris: "#d060ff", shadow: true }],
    "고룡": ["dragon", { c1: "#b02a1a", c2: "#f0c050", mem: "#6a1a1a", spine: "#f0c050", horn: "#f8e8b0", boss: true, fire: true, iris: "#ffe040" }],
    "뱀파이어": ["vampire", { c1: "#1a1424", c2: "#a01020" }],
    "흡혈 귀족": ["vampire", { c1: "#3a0a18", c2: "#e02040", noble: true, hair: "#e8e8f0", coat: "#4a1a28", iris: "#ff3040" }],
    "서큐버스": ["vampire", { succubus: true, skin: "#e8b0d0", hair: "#5a1a6a", wing: "#6a2a7a", dress: "#3a1048", iris: "#ff4ab0" }],
    "바위 골렘": ["golem", { c1: "#8a7a62", style: "rock" }],
    "강철 골렘": ["golem", { c1: "#a8b0bc", style: "steel", c3: "#40e0ff" }],
    "시간의 파수꾼": ["golem", { c1: "#d8b040", style: "time", c3: "#60e0ff" }],
    "나가": ["naga", { c1: "#2a8a8a", skin: "#9ad8d0", hair: "#1a5a7a" }],
    "켄타우로스 궁수": ["centaur", { c1: "#8a5a32", skin: "#e0b088" }],
    "암흑 기사": ["knight", { c1: "#3a3a4a", c2: "#a02a2a", type: "dark", horns: "#2a2030", fire: "#ff3040", cape: "#5a1018", great: true, bladeGlow: "#ff3040", bladeCol: "#4a4a58" }],
    "저주받은 갑옷": ["knight", { c1: "#5a6a5a", c2: "#8a7a4a", type: "cursed", fire: "#80ff80", shield: "#4a5a4a", emblem: "#60ff60" }],
    "망령 기사단장": ["knight", { c1: "#b8c8e0", c2: "#6a8ac0", type: "specter", fire: "#80e0ff", cape: "#3a4a7a", plume: "#e0f0ff", banner: true, bladeGlow: "#80e0ff" }],
    "듀라한": ["knight", { c1: "#2a2a34", c2: "#6a4aa0", type: "dullahan", fire: "#60c0ff", cape: "#1a1a2a", great: true }],
    "데스 나이트": ["knight", { c1: "#24242e", c2: "#6a7a8a", type: "death", fire: "#40e0ff", cape: "#1a1a28", great: true, bladeGlow: "#40e0ff", bladeCol: "#5a6a7a" }],
    "종말의 기사": ["knight", { c1: "#2a2228", c2: "#e0b030", type: "doom", fire: "#ff7020", cape: "#8a1010", great: true, bladeGlow: "#ff6a20", bladeCol: "#ffb060", crownCol: "#e0b030", horns: "#e0b030" }],
    "늪지 마녀": ["witch", { c1: "#3a5a3a", skin: "#9ac87a", type: "swamp", orb: "#a0ff60" }],
    "서리 여왕": ["witch", { c1: "#4a8ad0", c2: "#2a5aa0", skin: "#e8f4ff", type: "queen", orb: "#a0f0ff", iris: "#40c8ff" }],
    "눈보라 마녀": ["witch", { c1: "#3a5aa0", skin: "#f0e0e8", type: "blizzard", orb: "#c0f4ff" }],
    "리치": ["witch", { c1: "#3a1a5a", c2: "#24103a", type: "lich", orb: "#c070ff" }],
    "수줍은 미믹": ["mimic", { c1: "#8a5a32", shy: true }],
    "보물고의 미믹왕": ["mimic", { c1: "#a02a2a", c2: "#f0c840", king: true, iris: "#40e0ff" }],
    "키메라": ["chimera", { c1: "#d8a840", c2: "#c8402a", iris: "#ffe040" }],
    "만티코어": ["manticore", { c1: "#b8602a", c2: "#6a2a14" }],
    "바실리스크": ["basilisk", { c1: "#5a7a3a", c2: "#d8c880", crest: "#e0b030" }],
    "크라켄의 촉수": ["tentacle", { c1: "#8a3aa0", c2: "#e8a0c8" }],
    "심연의 촉수": ["tentacle", { c1: "#2a1a4a", c2: "#c060ff", abyss: true }],
    "아기 촉수": ["tentacle", { c1: "#f0a0c0", baby: true }],
    "히드라": ["hydra", { c1: "#3a8a4a", c2: "#d8d088" }],
    "눈꽃 새": ["bird", { c1: "#f4f8ff", c2: "#a8d8f8" }],
    "불사조": ["bird", { c1: "#ff8a20", phoenix: true }],
    "빙하 대지렁이": ["worm", { c1: "#9ac8e0", glacier: true, lip: "#c8e8f8", ground: "#d8e8f4", maw: "#60c0ff" }],
    "세계 포식자 웜": ["worm", { c1: "#5a2a8a", cosmic: true, lip: "#8a4ab0", ground: "#2a1a3a", maw: "#ff60e0" }],
    "상급 악마": ["demon", { c1: "#c0302a" }],
    "베헤모스": ["behemoth", { c1: "#5a3a5a", c2: "#8a6a6a" }],
    "타락천사": ["angel", { c1: "#2a2234", c2: "#c8a040" }],
    "혼돈의 마수": ["chaos", { c1: "#a03ab0", c2: "#30d0d0" }],
    "마왕의 그림자": ["kingshadow", { c1: "#1a1024" }],
    "공허의 군주": ["voidlord", { c1: "#3a1a5a" }]
  };

  /* ── 그리기와 다듬기 ── */
  const cache = new Map();
  function render(name, size) {
    const base = ART[name] ? name : name.replace(/^(광폭한|심연의) /, "");
    const spec = ART[base];
    if (!spec || !KINDS[spec[0]]) return null;
    const key = `${name}|${size}`;
    if (cache.has(key)) return cache.get(key);
    const L = Math.max(24, Math.round(size));
    const cv = F.sprites.makeCanvas(L, L);
    const g = cv.getContext("2d");
    const o = Object.assign({}, spec[1]);
    if (base !== name && name.startsWith("심연의")) { o.c1 = dark(o.c1, 0.6); o.iris = "#40f0ff"; }
    if (base !== name && name.startsWith("광폭한")) o.iris = "#ff2a2a";
    /* 틀 밖으로 나가면 조금씩 줄여 다시 그린다 */
    let fit = o.fit || 1;
    let P;
    for (let tries = 0; tries < 5; tries++) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, L, L);
      P = painter(g, L, fit);
      KINDS[spec[0]](P, o);
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (!clipped(g, L)) break;
      fit *= 0.92;
    }
    crisp(g, L);
    /* 빛나는 눈·물건은 다듬은 다음에 은은하게 */
    g.globalCompositeOperation = "lighter";
    P.glows.forEach((gl) => {
      const x = gl.x * P.u + P.ox;
      const y = gl.y * P.u + P.oy;
      const r = gl.r * P.u;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      const [cr, cg, cb] = rgb(gl.col.startsWith("#") ? gl.col : "#ffffff");
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${gl.a})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    });
    g.globalCompositeOperation = "source-over";
    cache.set(key, cv);
    return cv;
  }
  /* 위·왼쪽·오른쪽 가장자리에 그림이 닿았는가(땅인 아래쪽은 괜찮다) */
  function clipped(g, L) {
    const d = g.getImageData(0, 0, L, L).data;
    const solid = (x, y) => d[(y * L + x) * 4 + 3] > 110;
    for (let x = 0; x < L; x++) if (solid(x, 0) || solid(x, 1)) return true;
    for (let y = 0; y < L; y++) if (solid(0, y) || solid(L - 1, y) || solid(1, y) || solid(L - 2, y)) return true;
    return false;
  }
  /* 가장자리를 또렷하게: 반투명을 없애고 바깥에 1칸 짙은 테두리 */
  function crisp(g, L) {
    const img = g.getImageData(0, 0, L, L);
    const d = img.data;
    const solid = new Uint8Array(L * L);
    for (let i = 0; i < L * L; i++) {
      const a = d[i * 4 + 3];
      if (a >= 110) {
        if (a < 255) {
          const k = 255 / a;
          d[i * 4] = Math.min(255, d[i * 4] * k);
          d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k);
          d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k);
        }
        d[i * 4 + 3] = 255;
        solid[i] = 1;
      } else d[i * 4 + 3] = 0;
    }
    for (let y = 0; y < L; y++) for (let x = 0; x < L; x++) {
      const i = y * L + x;
      if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < L - 1 && solid[i + 1]) || (y > 0 && solid[i - L]) || (y < L - 1 && solid[i + L])) {
        d[i * 4] = 18;
        d[i * 4 + 1] = 12;
        d[i * 4 + 2] = 30;
        d[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }
  /* 전투에서 쓰는 정보: 나는가(그림자를 띄움) · 마법형인가(마력탄을 쏨) */
  const FLY = new Set(["bat", "imp", "fairy", "wisp", "ghost", "bird", "harpy", "angel"]);
  const SHOOT = new Set(["wisp", "ghost", "witch", "lich", "eye", "vampire", "fairy", "angel", "voidlord", "kingshadow"]);
  function info(name) {
    const base = ART[name] ? name : name.replace(/^(광폭한|심연의) /, "");
    const spec = ART[base];
    if (!spec) return null;
    const o = spec[1];
    return { kind: spec[0], fly: FLY.has(spec[0]) && !o.grounded, shooter: SHOOT.has(spec[0]) || !!(o.skeleton && o.mage) || !!o.mage };
  }

  F.monArt = { render, info, ART, KINDS, has: (name) => !!(ART[name] || ART[name.replace(/^(광폭한|심연의) /, "")]) };
})(typeof window !== "undefined" ? window : globalThis);
