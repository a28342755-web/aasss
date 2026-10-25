/*
 * 삼천의 운명 — 횡스크롤 기술 연출
 * 원래 해상도로 그리는 큰 효과들: 마력탄, 화염구, 결정 분출, 번개, 마법진, 운석, 빛기둥, 베기, 데미지 숫자.
 * 좌표는 월드 픽셀(화면 배율 z가 곱해진 값). 게임 루프가 update(dt)·draw(ctx)를 부르고,
 * 맞는 순간이 있는 연출은 Promise를 돌려준다(F.fx.sleep과 같은 시계를 쓴다).
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const X = F.fx;

  let Z = 2;
  const list = [];
  const parts = [];
  const nums = [];
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* 속성별 색: [가장 밝은 심, 밝은색, 본색, 어두운 테두리] */
  const PAL = {
    phys: ["#ffffff", "#eef4ff", "#b8c8e0", "#5a6a8a"],
    fire: ["#fff8d0", "#ffc04a", "#ff5a1e", "#9a1a08"],
    ice: ["#ffffff", "#c8f4ff", "#5ec8ff", "#2a5ad0"],
    bolt: ["#ffffff", "#fff6a0", "#ffd23a", "#b07a00"],
    earth: ["#fff0d0", "#e8b878", "#a86e3c", "#56361e"],
    wind: ["#ffffff", "#d0fff2", "#6ae8c0", "#1e8a6a"],
    light: ["#ffffff", "#fffae0", "#ffe27a", "#d89a1a"],
    dark: ["#f4e0ff", "#c08aff", "#7a3ae0", "#2a0a5a"],
    nature: ["#f4ffd8", "#b0f07a", "#4ac04a", "#16703a"],
    arcane: ["#ffffff", "#cdd4ff", "#7c7cff", "#3424c8"]
  };
  const pal = (el) => PAL[el] || PAL.arcane;

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1, 7), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
  }
  function glow(ctx, x, y, r, col, a) {
    if (r <= 0 || a <= 0) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(col, a));
    g.addColorStop(0.4, hexA(col, a * 0.45));
    g.addColorStop(1, hexA(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function add(e) {
    e.age = 0;
    list.push(e);
    return e;
  }
  function spark(x, y, o) {
    const p = Object.assign({ x, y, vx: 0, vy: 0, life: 500, age: 0, size: 1, col: "#ffffff", glow: 0, grav: 0, drag: 1, shape: "sq" }, o);
    parts.push(p);
    return p;
  }
  function sparkBurst(x, y, el, n, speed, o) {
    const c = pal(el);
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(speed * 0.25, speed);
      spark(x, y, Object.assign({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(300, 700), size: rand(0.8, 1.8), col: pick(c.slice(0, 3)), glow: 0.8, drag: 0.92, shape: Math.random() < 0.25 ? "star" : "sq" }, o));
    }
  }

  /* ── 투사체 ── */
  function travel(from, to, speed) {
    return Math.max(80, (Math.hypot(to[0] - from[0], to[1] - from[1]) / speed) * 1000);
  }
  /* kind: orb(기본 마력탄) · fireball(큰 구체) · arrow · bullet · star(던지기) */
  function shot(from, to, el, kind) {
    const c = pal(el);
    const big = kind === "fireball";
    const speed = (kind === "arrow" || kind === "bullet" ? 900 : big ? 420 : 520) * (Z / 2);
    const dur = travel(from, to, speed);
    const trail = [];
    if (kind === "bullet") add({ life: 90, draw(ctx, t) { glow(ctx, from[0], from[1], 12 * Z, c[1], 0.9 * (1 - t)); } });
    add({
      life: dur,
      update(dt, e) {
        const k = Math.min(1, e.age / dur);
        e.x = from[0] + (to[0] - from[0]) * k;
        e.y = from[1] + (to[1] - from[1]) * k + (kind === "star" ? Math.sin(k * Math.PI) * -10 * Z : 0);
        trail.unshift([e.x, e.y]);
        if (trail.length > (big ? 16 : 9)) trail.pop();
        if (kind === "orb" || big) {
          if (Math.random() < (big ? 0.9 : 0.5)) spark(e.x + rand(-3, 3) * Z, e.y + rand(-3, 3) * Z, { vx: rand(-20, 20) * Z - Math.sign(to[0] - from[0]) * 40 * Z, vy: rand(-30, 10) * Z, life: rand(250, 500), size: rand(0.8, 1.6), col: pick(c.slice(0, 3)), glow: 0.7, drag: 0.9 });
        }
      },
      draw(ctx, t, e) {
        if (e.x === undefined) return;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        if (kind === "arrow" || kind === "bullet") {
          const ang = Math.atan2(to[1] - from[1], to[0] - from[0]);
          const len = (kind === "arrow" ? 22 : 30) * Z;
          ctx.strokeStyle = hexA(c[1], 0.5);
          ctx.lineWidth = 3 * Z;
          ctx.beginPath();
          ctx.moveTo(e.x - Math.cos(ang) * len, e.y - Math.sin(ang) * len);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = kind === "arrow" ? "#f4ead0" : c[0];
          ctx.lineWidth = Math.max(1, Z);
          ctx.beginPath();
          ctx.moveTo(e.x - Math.cos(ang) * len * 0.7, e.y - Math.sin(ang) * len * 0.7);
          ctx.lineTo(e.x, e.y);
          ctx.stroke();
          if (kind === "arrow") {
            ctx.fillStyle = "#d0d8e8";
            ctx.beginPath();
            ctx.moveTo(e.x + Math.cos(ang) * 4 * Z, e.y + Math.sin(ang) * 4 * Z);
            ctx.lineTo(e.x + Math.cos(ang + 2.5) * 4 * Z, e.y + Math.sin(ang + 2.5) * 4 * Z);
            ctx.lineTo(e.x + Math.cos(ang - 2.5) * 4 * Z, e.y + Math.sin(ang - 2.5) * 4 * Z);
            ctx.fill();
          }
          ctx.restore();
          return;
        }
        if (ITEMS.has(kind)) {
          for (let i = trail.length - 1; i > 0; i -= 2) {
            const k = 1 - i / trail.length;
            ctx.globalAlpha = 0.35 * k;
            glow(ctx, trail[i][0], trail[i][1], 6 * Z * k + Z, c[2], 0.6);
          }
          ctx.globalAlpha = 1;
          glow(ctx, e.x, e.y, 14 * Z, c[2], 0.55);
          ctx.globalCompositeOperation = "source-over";
          item(ctx, kind, e.x, e.y, e.age / 1000, c);
          ctx.restore();
          return;
        }
        const r = (big ? 10 : kind === "star" ? 4 : 5) * Z;
        for (let i = trail.length - 1; i > 0; i--) {
          const k = 1 - i / trail.length;
          ctx.strokeStyle = hexA(i < 3 ? c[1] : c[2], 0.55 * k);
          ctx.lineWidth = r * 1.8 * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(trail[i][0], trail[i][1]);
          ctx.lineTo(trail[i - 1][0], trail[i - 1][1]);
          ctx.stroke();
        }
        glow(ctx, e.x, e.y, r * 3.2, c[2], 0.7);
        glow(ctx, e.x, e.y, r * 1.8, c[1], 0.9);
        ctx.fillStyle = c[0];
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        if (kind === "star") {
          ctx.translate(e.x, e.y);
          ctx.rotate(e.age / 40);
          ctx.fillStyle = c[0];
          ctx.fillRect(-r * 1.4, -Z * 0.5, r * 2.8, Z);
          ctx.fillRect(-Z * 0.5, -r * 1.4, Z, r * 2.8);
        }
        ctx.restore();
      }
    });
    return X.sleep(dur).then(() => {
      if (kind === "bomb") { impact(to[0], to[1], "fire", true); sparkBurst(to[0], to[1], "fire", 20, 220 * Z / 2); }
      else if (kind === "flask" || kind === "paint") { impact(to[0], to[1], el, true); sparkBurst(to[0], to[1], el, 18, 160 * Z / 2, { grav: 300 * Z / 2 }); }
      else impact(to[0], to[1], el, big);
    });
  }

  /* 던지는 물건들(부적·음표·카드·물약·동전·공·물감·폭탄): 원래 해상도 작은 그림 */
  const ITEMS = new Set(["talisman", "note", "card", "flask", "coin", "ball", "paint", "bomb"]);
  function item(ctx, kind, x, y, t, c) {
    const u = Z;
    ctx.save();
    ctx.translate(x, y);
    const line = "#1a1430";
    switch (kind) {
      case "talisman":
        ctx.rotate(Math.sin(t * 12) * 0.4);
        ctx.fillStyle = line; ctx.fillRect(-3.5 * u, -6.5 * u, 7 * u, 13 * u);
        ctx.fillStyle = "#f4e8c0"; ctx.fillRect(-3 * u, -6 * u, 6 * u, 12 * u);
        ctx.fillStyle = "#d83a3a"; ctx.fillRect(-0.5 * u, -4.5 * u, u, 9 * u); ctx.fillRect(-2 * u, -2 * u, 4 * u, u);
        break;
      case "note":
        ctx.rotate(Math.sin(t * 8) * 0.3);
        ctx.fillStyle = c[0];
        ctx.beginPath(); ctx.ellipse(-1.5 * u, 3 * u, 3 * u, 2.2 * u, -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(1 * u, -6 * u, 1.2 * u, 9 * u);
        ctx.fillRect(1 * u, -6 * u, 4 * u, 1.6 * u);
        break;
      case "card": {
        const sx = Math.cos(t * 18);
        ctx.scale(Math.abs(sx) < 0.15 ? 0.15 : sx, 1);
        ctx.fillStyle = line; ctx.fillRect(-4 * u, -5.5 * u, 8 * u, 11 * u);
        ctx.fillStyle = "#ffffff"; ctx.fillRect(-3.5 * u, -5 * u, 7 * u, 10 * u);
        ctx.fillStyle = "#e0303a"; ctx.beginPath(); ctx.moveTo(0, -2.5 * u); ctx.lineTo(2 * u, 0); ctx.lineTo(0, 2.5 * u); ctx.lineTo(-2 * u, 0); ctx.fill();
        break;
      }
      case "flask":
        ctx.rotate(t * 10);
        ctx.fillStyle = line; ctx.beginPath(); ctx.arc(0, 1.5 * u, 4.4 * u, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-1.6 * u, -5.5 * u, 3.2 * u, 5 * u);
        ctx.fillStyle = "#cfe8ff"; ctx.fillRect(-1 * u, -5 * u, 2 * u, 4 * u);
        ctx.fillStyle = c[2]; ctx.beginPath(); ctx.arc(0, 1.5 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(-2 * u, -0.5 * u, u, u);
        break;
      case "coin": {
        const sx = Math.abs(Math.cos(t * 16)) * 0.85 + 0.15;
        ctx.scale(sx, 1);
        ctx.fillStyle = "#8a5a10"; ctx.beginPath(); ctx.arc(0, 0, 4.4 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffcf3a"; ctx.beginPath(); ctx.arc(0, 0, 3.6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff6c0"; ctx.fillRect(-1.5 * u, -2.5 * u, u, 3 * u);
        break;
      }
      case "ball": {
        const col = ["#e8403a", "#3a8ae8", "#f0c030", "#40c060"][Math.floor(t * 7) % 4];
        ctx.fillStyle = line; ctx.beginPath(); ctx.arc(0, 0, 4 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 3.3 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffffff"; ctx.fillRect(-2 * u, -2 * u, 1.2 * u, 1.2 * u);
        break;
      }
      case "paint":
        ctx.fillStyle = c[2]; ctx.beginPath(); ctx.ellipse(0, 0, 5 * u, 3.6 * u, t * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(-1.2 * u, -0.8 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill();
        break;
      default: /* bomb */
        ctx.fillStyle = "#2a2a36"; ctx.beginPath(); ctx.arc(0, 0, 4.6 * u, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#5a5a6a"; ctx.fillRect(-2 * u, -2.5 * u, 1.4 * u, 1.4 * u);
        ctx.fillStyle = "#c8a070"; ctx.fillRect(1 * u, -6 * u, u, 2.4 * u);
        if (Math.floor(t * 20) % 2) { ctx.fillStyle = "#ffd23a"; ctx.fillRect(0.5 * u, -7.5 * u, 2 * u, 2 * u); }
    }
    ctx.restore();
  }

  /* 하늘에서 쏟아지는 비: 화살·포탄·카드·음표·동전 */
  function rain(kind, xs, gy, el) {
    const jobs = [];
    xs.forEach((tx, i) => {
      const n = kind === "bullet" ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const x = tx + rand(-26, 26) * Z;
        const delay = i * 70 + k * 60 + rand(0, 40);
        jobs.push(X.sleep(delay).then(() => {
          const from = kind === "arrow" ? [x - 90 * Z, gy - 300 * Z] : [x + rand(-40, 40) * Z, gy - 280 * Z];
          const to = [x, gy - rand(4, 16) * Z];
          if (kind === "bullet") return meteors([x], gy, "fire");
          return shot(from, to, el, kind);
        }));
      }
    });
    return Promise.all(jobs);
  }

  /* 칼바람: 거대한 초승달 베기가 앞으로 밀려 나간다 */
  function bladeWave(x, y, dir, el, span) {
    const c = pal(el === "phys" ? "phys" : el);
    for (let k = 0; k < 3; k++) {
      X.sleep(k * 110).then(() => {
        const sx = x;
        add({
          life: 520,
          draw(ctx, t) {
            const cx = sx + dir * span * t;
            const R = (54 + k * 10) * Z;
            const fade = 1 - t;
            ctx.save();
            ctx.translate(cx, y);
            ctx.scale(dir, 1);
            ctx.globalCompositeOperation = "lighter";
            for (let i = 0; i < 4; i++) {
              ctx.strokeStyle = hexA(i === 3 ? c[0] : i === 2 ? c[1] : c[2], (0.3 + i * 0.2) * fade);
              ctx.lineWidth = (12 - i * 3) * Z;
              ctx.lineCap = "round";
              ctx.beginPath();
              ctx.arc(-R * 0.6, 0, R - i * 2 * Z, -1.25, 1.25);
              ctx.stroke();
            }
            ctx.restore();
            if (Math.random() < 0.6) spark(cx + rand(-10, 10) * Z, y + rand(-R * 0.8, R * 0.8), { vx: dir * rand(20, 80) * Z / 2, life: 400, col: pick(c.slice(0, 2)), glow: 0.8, size: rand(1, 1.6) });
          }
        });
      });
    }
    return X.sleep(420);
  }


  /* 맞은 자리: 빛 번짐, 고리, 튀는 불꽃 */
  function impact(x, y, el, big) {
    const c = pal(el);
    const R = (big ? 26 : 14) * Z;
    add({
      life: big ? 420 : 260,
      draw(ctx, t) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x, y, R * (0.8 + t), c[1], 0.9 * (1 - t));
        ctx.strokeStyle = hexA(c[1], 1 - t);
        ctx.lineWidth = Math.max(1, Z * (big ? 2 : 1.4) * (1 - t));
        ctx.beginPath();
        ctx.ellipse(x, y, R * (0.3 + t), R * (0.3 + t) * 0.8, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
    sparkBurst(x, y, el, big ? 26 : 10, (big ? 260 : 160) * Z / 2);
  }

  /* ── 근접 베기: 초승달 모양 궤적 ── */
  function slash(x, y, dir, el, big, flip) {
    const c = pal(el === "phys" ? "phys" : el);
    const R = (big ? 40 : 30) * Z;
    const a0 = flip ? 0.9 : -1.6;
    const a1 = flip ? -1.4 : 1.1;
    add({
      life: 220,
      draw(ctx, t) {
        const k = Math.min(1, t * 1.8);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(dir, 1);
        ctx.globalCompositeOperation = "lighter";
        const end = a0 + (a1 - a0) * k;
        const fade = 1 - Math.max(0, (t - 0.45) / 0.55);
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = hexA(i === 3 ? c[0] : i === 2 ? c[1] : c[2], (0.25 + i * 0.22) * fade);
          ctx.lineWidth = (8 - i * 2) * Z * (big ? 1.2 : 1);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(0, 0, R - i * 1.5 * Z, Math.min(a0, end), Math.max(a0, end), false);
          ctx.stroke();
        }
        ctx.restore();
      }
    });
    for (let i = 0; i < (big ? 10 : 5); i++) spark(x + dir * rand(10, 30) * Z, y + rand(-20, 20) * Z, { vx: dir * rand(40, 140) * Z / 2, vy: rand(-60, 60) * Z / 2, life: rand(200, 400), col: pick(c.slice(0, 2)), glow: 0.7, size: rand(0.8, 1.4), drag: 0.9 });
  }

  /* ── 땅에서 솟는 결정(얼음·바위·빛창·가시) ── */
  function crystals(x, gy, el, width, big) {
    const c = pal(el);
    const n = big ? 9 : 6;
    const spikes = [];
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      spikes.push({ dx: u * width * 0.5 + rand(-6, 6) * Z, h: (big ? 70 : 46) * Z * (1 - Math.abs(u) * 0.55) * rand(0.75, 1.1), w: rand(5, 9) * Z * (big ? 1.2 : 1), lean: rand(-0.18, 0.18) + u * 0.2, delay: Math.abs(u) * 0.12 + rand(0, 0.05) });
    }
    spikes.sort((a, b) => b.h - a.h);
    add({
      life: 900,
      draw(ctx, t) {
        ctx.save();
        const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x, gy - 20 * Z, width * 0.8, c[2], 0.35 * fade);
        ctx.globalCompositeOperation = "source-over";
        spikes.forEach((s) => {
          const g = Math.max(0, Math.min(1, (t - s.delay) * 6));
          if (g <= 0) return;
          const bx = x + s.dx;
          const tx = bx + s.lean * s.h * g;
          const ty = gy - s.h * g;
          ctx.globalAlpha = fade;
          ctx.fillStyle = hexA(c[3], 0.95);
          ctx.beginPath(); ctx.moveTo(bx - s.w, gy); ctx.lineTo(tx, ty); ctx.lineTo(bx + s.w, gy); ctx.fill();
          ctx.fillStyle = hexA(c[2], 0.95);
          ctx.beginPath(); ctx.moveTo(bx - s.w * 0.75, gy); ctx.lineTo(tx, ty + Z); ctx.lineTo(bx, gy); ctx.fill();
          ctx.fillStyle = hexA(c[1], 0.95);
          ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(tx, ty + Z); ctx.lineTo(bx + s.w * 0.7, gy); ctx.fill();
          ctx.strokeStyle = hexA(c[0], 0.9);
          ctx.lineWidth = Math.max(1, Z * 0.6);
          ctx.beginPath(); ctx.moveTo(tx, ty + Z); ctx.lineTo(bx + s.w * 0.1, gy); ctx.stroke();
        });
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "lighter";
        spikes.slice(0, 3).forEach((s) => glow(ctx, x + s.dx + s.lean * s.h, gy - s.h, 10 * Z, c[0], 0.6 * fade));
        ctx.restore();
      }
    });
    X.sleep(160).then(() => {
      for (let i = 0; i < (big ? 30 : 16); i++) spark(x + rand(-width / 2, width / 2), gy - rand(0, 50) * Z, { vx: rand(-40, 40) * Z / 2, vy: rand(-140, -30) * Z / 2, grav: 260 * Z / 2, life: rand(400, 800), col: pick(c.slice(0, 3)), glow: 0.6, size: rand(0.8, 1.6), shape: Math.random() < 0.3 ? "star" : "sq" });
    });
    return X.sleep(170);
  }

  /* 불길: 땅에서 치솟는 불꽃 기둥 몇 개 */
  function flames(x, gy, el, width, big) {
    const c = pal(el);
    const cols = big ? 5 : 3;
    for (let i = 0; i < cols; i++) {
      const fx = x + ((i / Math.max(1, cols - 1)) * 2 - 1) * width * 0.4;
      X.sleep(i * 50).then(() => {
        for (let k = 0; k < 18; k++) spark(fx + rand(-6, 6) * Z, gy - rand(0, 8) * Z, { vx: rand(-20, 20) * Z / 2, vy: rand(-260, -120) * Z / 2, life: rand(300, 650), col: pick(c.slice(0, 3)), glow: 1, size: rand(1.2, 2.6), drag: 0.95 });
      });
    }
    add({ life: 600, draw(ctx, t) { ctx.save(); ctx.globalCompositeOperation = "lighter"; glow(ctx, x, gy - 24 * Z, width * 0.7, c[2], 0.6 * (1 - t)); ctx.restore(); } });
    return X.sleep(150);
  }

  /* 회오리 */
  function tornado(x, gy, el, big) {
    const c = pal(el);
    const H = (big ? 110 : 80) * Z;
    add({
      life: 800,
      draw(ctx, t) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const fade = t > 0.75 ? (1 - t) / 0.25 : Math.min(1, t * 5);
        for (let i = 0; i < 14; i++) {
          const k = i / 13;
          const r = (6 + k * 26) * Z * (big ? 1.3 : 1);
          const y = gy - k * H;
          const ph = t * 30 + i * 0.8;
          ctx.strokeStyle = hexA(i % 3 ? c[1] : c[0], 0.55 * fade);
          ctx.lineWidth = Math.max(1, Z * 1.2);
          ctx.beginPath();
          ctx.ellipse(x + Math.sin(ph * 0.3) * 4 * Z, y, r, r * 0.28, 0, ph, ph + 4);
          ctx.stroke();
        }
        glow(ctx, x, gy - H * 0.5, H * 0.5, c[2], 0.3 * fade);
        ctx.restore();
      }
    });
    return X.sleep(200);
  }

  /* ── 번개: 가지 친 지그재그 ── */
  function bolt(from, to, el) {
    const c = pal(el === "phys" ? "bolt" : el);
    const make = () => {
      const pts = [from.slice()];
      const n = 9;
      for (let i = 1; i < n; i++) {
        const k = i / n;
        pts.push([from[0] + (to[0] - from[0]) * k + rand(-6, 6) * Z, from[1] + (to[1] - from[1]) * k + rand(-16, 16) * Z]);
      }
      pts.push(to.slice());
      const branches = [];
      for (let b = 0; b < 3; b++) {
        const s = pts[2 + Math.floor(Math.random() * (pts.length - 4))];
        const br = [s];
        let px = s[0];
        let py = s[1];
        for (let i = 0; i < 3; i++) { px += rand(8, 20) * Z * Math.sign(to[0] - from[0] || 1); py += rand(-18, 18) * Z; br.push([px, py]); }
        branches.push(br);
      }
      return { pts, branches };
    };
    let shape = make();
    let swap = 0;
    const stroke = (ctx, pts, w, col) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = "miter";
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    };
    add({
      life: 380,
      update(dt) { swap += dt; if (swap > 70) { swap = 0; shape = make(); } },
      draw(ctx, t) {
        const a = t < 0.7 ? 1 : (1 - t) / 0.3;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        stroke(ctx, shape.pts, 9 * Z, hexA(c[3], 0.35 * a));
        stroke(ctx, shape.pts, 5 * Z, hexA(c[2], 0.6 * a));
        shape.branches.forEach((b) => stroke(ctx, b, 2 * Z, hexA(c[2], 0.7 * a)));
        stroke(ctx, shape.pts, 2 * Z, hexA(c[1], a));
        stroke(ctx, shape.pts, Math.max(1, Z * 0.8), hexA(c[0], a));
        glow(ctx, to[0], to[1], 26 * Z, c[1], 0.8 * a);
        glow(ctx, from[0], from[1], 14 * Z, c[1], 0.6 * a);
        ctx.restore();
      }
    });
    sparkBurst(to[0], to[1], el === "phys" ? "bolt" : el, 14, 200 * Z / 2);
    return X.sleep(90);
  }

  /* ── 마법진: 겹 원, 별 문양, 룬 점, 주위를 떠도는 결정 ── */
  function circle(x, gy, el, dur) {
    const c = pal(el);
    const R = 56 * Z;
    return add({
      life: dur || 1400,
      draw(ctx, t, e) {
        const g = t < 0.15 ? t / 0.15 : t > 0.85 ? (1 - t) / 0.15 : 1;
        const rot = e.age * 0.0012;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        glow(ctx, x, gy, R * 1.4, c[2], 0.35 * g);
        ctx.translate(x, gy);
        ctx.scale(1, 0.3);
        ctx.strokeStyle = hexA(c[1], 0.95 * g);
        ctx.lineWidth = Math.max(1, Z);
        [1, 0.84, 0.56].forEach((k) => { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, Math.PI * 2); ctx.stroke(); });
        ctx.strokeStyle = hexA(c[2], 0.6 * g);
        ctx.lineWidth = 4 * Z;
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = hexA(c[0], 0.9 * g);
        ctx.lineWidth = Math.max(1, Z);
        for (let s = 0; s < 2; s++) {
          ctx.beginPath();
          for (let k = 0; k <= 3; k++) {
            const a = rot * (s ? -1 : 1) + s * Math.PI / 3 + (k * Math.PI * 2) / 3;
            const px = Math.cos(a) * R * 0.84;
            const py = Math.sin(a) * R * 0.84;
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
        }
        ctx.fillStyle = hexA(c[0], g);
        for (let k = 0; k < 16; k++) {
          const a = -rot * 1.6 + (k / 16) * Math.PI * 2;
          ctx.fillRect(Math.cos(a) * R * 0.92 - Z, Math.sin(a) * R * 0.92 - Z * 2, 2 * Z, 4 * Z);
        }
        ctx.restore();
        /* 떠도는 결정 */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 4; k++) {
          const a = rot * 2 + (k * Math.PI) / 2;
          const px = x + Math.cos(a) * R * 1.05;
          const py = gy - 46 * Z + Math.sin(a) * 10 * Z + Math.sin(e.age / 300 + k) * 4 * Z;
          const s = 7 * Z;
          glow(ctx, px, py, 16 * Z, c[2], 0.6 * g);
          ctx.fillStyle = hexA(c[1], 0.95 * g);
          ctx.beginPath(); ctx.moveTo(px, py - s * 1.6); ctx.lineTo(px + s * 0.6, py); ctx.lineTo(px, py + s * 1.6); ctx.lineTo(px - s * 0.6, py); ctx.fill();
          ctx.fillStyle = hexA(c[0], g);
          ctx.fillRect(px - Z * 0.5, py - s, Math.max(1, Z), s * 1.4);
        }
        ctx.restore();
        if (Math.random() < 0.5 * g) spark(x + rand(-R, R), gy - rand(0, 6) * Z, { vy: rand(-90, -30) * Z / 2, life: rand(500, 900), col: pick(c.slice(0, 2)), glow: 0.8, size: rand(0.8, 1.4), shape: Math.random() < 0.3 ? "star" : "sq" });
      }
    });
  }

  /* ── 운석: 꼬리가 긴 큰 구체가 비스듬히 떨어진다 ── */
  function meteors(xs, gy, el) {
    const c = pal(el);
    const jobs = xs.map((tx, i) => X.sleep(i * 120).then(() => {
      const sx = tx + 120 * Z;
      const sy = gy - 300 * Z;
      const dur = 360;
      const trail = [];
      add({
        life: dur,
        update(dt, e) {
          const k = Math.min(1, e.age / dur);
          e.x = sx + (tx - sx) * k;
          e.y = sy + (gy - sy) * k * k;
          trail.unshift([e.x, e.y]);
          if (trail.length > 14) trail.pop();
          if (Math.random() < 0.9) spark(e.x, e.y, { vx: rand(10, 60) * Z / 2, vy: rand(-80, -20) * Z / 2, life: rand(250, 500), col: pick(c.slice(0, 3)), glow: 0.8, size: rand(1, 2), drag: 0.92 });
        },
        draw(ctx, t, e) {
          if (e.x === undefined) return;
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          for (let i = trail.length - 1; i > 0; i--) {
            const k = 1 - i / trail.length;
            ctx.strokeStyle = hexA(i < 4 ? c[1] : c[2], 0.6 * k);
            ctx.lineWidth = 22 * Z * k;
            ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(trail[i][0], trail[i][1]); ctx.lineTo(trail[i - 1][0], trail[i - 1][1]); ctx.stroke();
          }
          glow(ctx, e.x, e.y, 34 * Z, c[2], 0.8);
          glow(ctx, e.x, e.y, 18 * Z, c[1], 1);
          ctx.fillStyle = c[0];
          ctx.beginPath(); ctx.arc(e.x, e.y, 6 * Z, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      });
      return X.sleep(dur).then(() => {
        impact(tx, gy - 6 * Z, el, true);
        crystals(tx, gy, el, 60 * Z, false);
      });
    }));
    return Promise.all(jobs);
  }

  /* ── 빛기둥: 하늘까지 솟는 기둥과 감도는 고리 ── */
  function pillar(x, gy, el, big) {
    const c = pal(el);
    const W = (big ? 34 : 22) * Z;
    const H = 360 * Z;
    add({
      life: big ? 1100 : 700,
      draw(ctx, t, e) {
        const g = t < 0.12 ? t / 0.12 : t > 0.6 ? (1 - t) / 0.4 : 1;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const lg = ctx.createLinearGradient(x - W, 0, x + W, 0);
        lg.addColorStop(0, hexA(c[2], 0));
        lg.addColorStop(0.3, hexA(c[2], 0.45 * g));
        lg.addColorStop(0.5, hexA(c[0], 0.95 * g));
        lg.addColorStop(0.7, hexA(c[2], 0.45 * g));
        lg.addColorStop(1, hexA(c[2], 0));
        ctx.fillStyle = lg;
        ctx.fillRect(x - W, gy - H, W * 2, H);
        glow(ctx, x, gy, W * 2.6, c[1], 0.7 * g);
        if (big) {
          for (let k = 0; k < 3; k++) {
            const ry = gy - (30 + k * 46) * Z - ((e.age / 6) % 46) * Z * 0.4;
            const rr = (46 - k * 8) * Z;
            ctx.strokeStyle = hexA(k % 2 ? c[1] : c[0], 0.75 * g);
            ctx.lineWidth = Math.max(1, Z * 1.4);
            ctx.beginPath();
            ctx.ellipse(x, ry, rr, rr * 0.22, 0, e.age / 200 + k, e.age / 200 + k + Math.PI * 1.5);
            ctx.stroke();
          }
        }
        ctx.restore();
        if (Math.random() < 0.7 * g) spark(x + rand(-W, W), gy - rand(0, 120) * Z, { vy: rand(-160, -60) * Z / 2, life: rand(400, 800), col: pick(c.slice(0, 2)), glow: 0.9, size: rand(0.8, 1.5), shape: Math.random() < 0.4 ? "star" : "sq" });
      }
    });
    return X.sleep(140);
  }

  /* ── 자기 강화·회복·보호막 ── */
  function aura(x, gy, el) {
    const c = pal(el);
    add({
      life: 700,
      draw(ctx, t) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let k = 0; k < 2; k++) {
          const tt = Math.max(0, t - k * 0.2);
          const r = (16 + tt * 30) * Z;
          ctx.strokeStyle = hexA(c[1], (1 - tt) * 0.9);
          ctx.lineWidth = Math.max(1, Z * 1.6);
          ctx.beginPath(); ctx.ellipse(x, gy - tt * 50 * Z, r, r * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
        }
        glow(ctx, x, gy - 24 * Z, 40 * Z, c[2], 0.4 * (1 - t));
        ctx.restore();
      }
    });
    for (let i = 0; i < 14; i++) spark(x + rand(-16, 16) * Z, gy - rand(0, 30) * Z, { vy: rand(-120, -50) * Z / 2, life: rand(500, 900), col: pick(c.slice(0, 3)), glow: 0.8, size: rand(1, 1.6), shape: i % 3 ? "sq" : "up" });
  }
  function heal(x, gy) {
    const c = pal("nature");
    for (let i = 0; i < 10; i++) spark(x + rand(-18, 18) * Z, gy - rand(0, 40) * Z, { vy: rand(-90, -40) * Z / 2, life: rand(600, 1000), col: pick(c.slice(0, 3)), glow: 0.8, size: rand(1.4, 2), shape: "cross" });
    aura(x, gy, "nature");
  }
  function shieldBubble(x, cy, r) {
    const c = pal("ice");
    add({
      life: 650,
      draw(ctx, t) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = 1 - t;
        ctx.strokeStyle = hexA(c[1], 0.9 * g);
        ctx.lineWidth = Math.max(1, Z * 1.4);
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
          const px = x + Math.cos(a) * r * (0.9 + t * 0.2);
          const py = cy + Math.sin(a) * r * (0.9 + t * 0.2);
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        glow(ctx, x, cy, r * 1.2, c[2], 0.35 * g);
        ctx.restore();
      }
    });
  }

  /* 착지·달리기 먼지 */
  function dust(x, gy, dir, n) {
    for (let i = 0; i < (n || 5); i++) {
      spark(x + rand(-6, 6) * Z, gy - rand(0, 3) * Z, { vx: (dir || (Math.random() < 0.5 ? -1 : 1)) * rand(20, 70) * Z / 2, vy: rand(-40, -10) * Z / 2, life: rand(250, 450), col: pick(["#e8dcc8", "#c8b89c", "#ffffff"]), size: rand(1.2, 2.2), drag: 0.9, add: false });
    }
  }

  /* 레벨 업: 금빛 기둥과 글자 */
  function levelUp(x, gy) {
    pillar(x, gy, "light", true);
    aura(x, gy, "light");
    number(x, gy - 70 * Z, "LEVEL UP!", "level", 0);
  }

  /* ── 데미지 숫자 ── */
  const GLYPH = {
    "0": ["0110", "1001", "1001", "1001", "1001", "1001", "0110"], "1": ["0010", "0110", "0010", "0010", "0010", "0010", "0111"],
    "2": ["0110", "1001", "0001", "0010", "0100", "1000", "1111"], "3": ["1110", "0001", "0001", "0110", "0001", "0001", "1110"],
    "4": ["0010", "0110", "1010", "1010", "1111", "0010", "0010"], "5": ["1111", "1000", "1110", "0001", "0001", "1001", "0110"],
    "6": ["0110", "1000", "1000", "1110", "1001", "1001", "0110"], "7": ["1111", "0001", "0010", "0010", "0100", "0100", "0100"],
    "8": ["0110", "1001", "1001", "0110", "1001", "1001", "0110"], "9": ["0110", "1001", "1001", "0111", "0001", "0001", "0110"],
    "+": ["000", "000", "010", "111", "010", "000", "000"], "-": ["000", "000", "000", "111", "000", "000", "000"],
    M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"], I: ["111", "010", "010", "010", "010", "010", "111"],
    S: ["0111", "1000", "1000", "0110", "0001", "0001", "1110"], L: ["100", "100", "100", "100", "100", "100", "111"],
    E: ["111", "100", "100", "111", "100", "100", "111"], V: ["10001", "10001", "10001", "01010", "01010", "00100", "00100"],
    U: ["1001", "1001", "1001", "1001", "1001", "1001", "0110"], P: ["1110", "1001", "1001", "1110", "1000", "1000", "1000"],
    "!": ["1", "1", "1", "1", "1", "0", "1"], " ": ["00", "00", "00", "00", "00", "00", "00"], G: ["0110", "1000", "1000", "1011", "1001", "1001", "0111"]
  };
  const NUM_STYLE = {
    hit: { top: "#fff6b0", bot: "#ff9a1e", edge: "#3a1a06", s: 1 },
    crit: { top: "#ffe0a0", bot: "#ff3a2a", edge: "#3a0606", s: 1.25 },
    taken: { top: "#e8c8ff", bot: "#9a3ad8", edge: "#1e0630", s: 1 },
    heal: { top: "#e0ffd0", bot: "#3ac85a", edge: "#06300e", s: 0.9 },
    mp: { top: "#d8eaff", bot: "#3a7aff", edge: "#061a40", s: 0.9 },
    miss: { top: "#ffffff", bot: "#a8b4c8", edge: "#1a2030", s: 0.8 },
    dot: { top: "#ffd8f0", bot: "#d84a9a", edge: "#300620", s: 0.8 },
    gold: { top: "#fff6c0", bot: "#e0a020", edge: "#3a2606", s: 0.8 },
    level: { top: "#ffffff", bot: "#ffd23a", edge: "#3a2606", s: 1.1 }
  };
  const textCache = new Map();
  function textSprite(str, kind) {
    const key = `${kind}|${str}|${Z}`;
    let cv = textCache.get(key);
    if (cv) return cv;
    const st = NUM_STYLE[kind] || NUM_STYLE.hit;
    const px = Math.max(2, Math.round(2.4 * Z * st.s));
    const glyphs = str.split("").map((ch) => GLYPH[ch] || GLYPH[" "]);
    const w = glyphs.reduce((a, g) => a + (g[0].length + 1) * px, 0) + px * 2;
    const h = 7 * px + px * 2;
    cv = F.sprites.makeCanvas(w, h);
    const g = cv.getContext("2d");
    const grad = g.createLinearGradient(0, px, 0, h - px);
    grad.addColorStop(0, st.top);
    grad.addColorStop(1, st.bot);
    const paint = (ox, oy, style) => {
      g.fillStyle = style;
      let cx = px + ox;
      glyphs.forEach((gl) => {
        gl.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === "1") g.fillRect(cx + rx * px, px + oy + ry * px, px, px); });
        cx += (gl[0].length + 1) * px;
      });
    };
    const o = Math.max(1, Math.round(px / 2));
    [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [o, -o], [-o, o]].forEach(([dx, dy]) => paint(dx, dy, st.edge));
    paint(0, 0, grad);
    if (textCache.size > 400) textCache.clear();
    textCache.set(key, cv);
    return cv;
  }
  /* line: 여러 번 맞을 때 몇 번째 줄인지(위로 쌓인다) */
  function number(x, y, value, kind, line) {
    const str = typeof value === "number" ? String(value) : value;
    const img = textSprite(str, kind);
    nums.push({ x, y: y - (line || 0) * img.height * 0.82, img, age: -(line || 0) * 70, life: kind === "level" ? 1400 : 900, kind });
  }

  /* ── 갱신·그리기 ── */
  function update(dt) {
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      e.age += dt;
      if (e.update) e.update(dt, e);
      if (e.age >= e.life) list.splice(i, 1);
    }
    const s = dt / 1000;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * s;
      const dr = Math.pow(p.drag, dt / 16.7);
      p.vx *= dr;
      p.vy *= dr;
      p.x += p.vx * s;
      p.y += p.vy * s;
    }
    for (let i = nums.length - 1; i >= 0; i--) {
      nums[i].age += dt;
      if (nums[i].age >= nums[i].life) nums.splice(i, 1);
    }
  }

  function draw(ctx) {
    list.forEach((e) => e.draw(ctx, Math.min(1, e.age / e.life), e));
    ctx.save();
    parts.forEach((p) => {
      const f = 1 - p.age / p.life;
      if (p.glow) { ctx.globalCompositeOperation = "lighter"; glow(ctx, p.x, p.y, (3 + p.size * 2) * Z, p.col, p.glow * f * 0.6); }
      ctx.globalCompositeOperation = p.add === false ? "source-over" : "lighter";
      ctx.globalAlpha = Math.min(1, f * 1.5);
      ctx.fillStyle = p.col;
      const sz = Math.max(1, Math.round(p.size * Z));
      const x = Math.round(p.x - sz / 2);
      const y = Math.round(p.y - sz / 2);
      if (p.shape === "star") {
        ctx.fillRect(x - sz, y, sz * 3, Math.max(1, Math.round(sz / 2)));
        ctx.fillRect(x, y - sz, Math.max(1, Math.round(sz / 2)), sz * 3);
      } else if (p.shape === "cross") {
        ctx.fillRect(x - sz, y, sz * 3, sz);
        ctx.fillRect(x, y - sz, sz, sz * 3);
      } else if (p.shape === "up") {
        ctx.fillRect(x, y, sz, sz * 3);
        ctx.fillRect(x - sz, y + sz, sz * 3, sz);
      } else ctx.fillRect(x, y, sz, sz);
    });
    ctx.restore();
  }

  function drawNumbers(ctx) {
    nums.forEach((n) => {
      if (n.age < 0) return;
      const k = n.age / n.life;
      const rise = (n.kind === "level" ? 30 : 34) * Z * Math.min(1, k * 2.2);
      const pop = k < 0.08 ? 1.25 - k * 3 : 1;
      const a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const w = n.img.width * pop;
      const h = n.img.height * pop;
      ctx.globalAlpha = a;
      ctx.drawImage(n.img, Math.round(n.x - w / 2), Math.round(n.y - rise - h), Math.round(w), Math.round(h));
    });
    ctx.globalAlpha = 1;
  }

  function clear() {
    list.length = 0;
    parts.length = 0;
    nums.length = 0;
  }

  /* 몬스터 투사체를 그릴 때 쓰는 빛나는 구슬 */
  function orbAt(ctx, x, y, r, el) {
    const c = pal(el);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    glow(ctx, x, y, r * 3, c[2], 0.7);
    glow(ctx, x, y, r * 1.6, c[1], 0.9);
    ctx.fillStyle = c[0];
    ctx.beginPath();
    ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  F.spells = {
    PAL, ITEMS, setZoom(z) { Z = z; textCache.clear(); }, shot, rain, bladeWave, impact, slash, crystals, flames, tornado, bolt, circle, meteors, pillar, aura, heal,
    shieldBubble, dust, levelUp, number, update, draw, drawNumbers, clear, orbAt, glow, spark, sparkBurst, add
  };
})(typeof window !== "undefined" ? window : globalThis);
