/*
 * 삼천의 운명 — 전투 연출
 * 입자(가산 혼합 발광) + 원소별 기술 연출 + 도트 숫자. 시간은 게임 루프가 tick(dt)로 흘려 주며,
 * 연출 함수는 '타격 순간'에 끝나는 Promise를 돌려줘 전투 진행과 맞물린다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const S = F.sprites;
  const C = S.C;

  /* ── 시간 ── */
  let clock = 0;
  const timers = [];
  function sleep(ms) {
    return new Promise((res) => timers.push({ at: clock + ms, res }));
  }
  function tick(dt) {
    clock += dt;
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= clock) { const t = timers.splice(i, 1)[0]; t.res(); }
    }
  }
  function flushTimers() {
    while (timers.length) timers.pop().res();
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  /* ── 입자 ── */
  const parts = [];
  const shapes = [];
  function add(p) {
    p.age = 0;
    p.life = p.life || 600;
    p.size = p.size || 1;
    p.drag = p.drag === undefined ? 1 : p.drag;
    parts.push(p);
    return p;
  }
  /* 모양 연출(고리, 번개, 기둥 등): draw(ctx, t, shape) */
  function addShape(s) {
    s.age = 0;
    shapes.push(s);
    return s;
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      const k = dt / 16.67;
      p.vx = (p.vx || 0) * Math.pow(p.drag, k) + (p.ax || 0) * k;
      p.vy = (p.vy || 0) * Math.pow(p.drag, k) + (p.ay || 0) * k;
      p.x += p.vx * k;
      p.y += p.vy * k;
      if (p.trail && Math.random() < p.trail) {
        add({ x: p.x + rand(-1, 1), y: p.y + rand(-1, 1), vx: rand(-0.3, 0.3) - p.vx * 0.1, vy: rand(-0.4, 0.1), life: rand(200, 420), color: pick(p.trailColors || [p.color]), glow: 0.5, size: 1 });
      }
      if (p.target && p.age >= p.travel) {
        p.target = null;
        if (p.onHit) p.onHit();
        parts.splice(i, 1);
      }
    }
    for (let i = shapes.length - 1; i >= 0; i--) {
      shapes[i].age += dt;
      if (shapes[i].age >= shapes[i].life) shapes.splice(i, 1);
    }
  }

  function glowDot(ctx, x, y, r, color, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(color, a));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function draw(ctx) {
    ctx.save();
    shapes.forEach((s) => { if (s.under) s.draw(ctx, s.age / s.life, s); });
    ctx.globalCompositeOperation = "lighter";
    parts.forEach((p) => {
      if (!p.glow) return;
      const fade = 1 - p.age / p.life;
      glowDot(ctx, p.x, p.y, (p.glowR || 4) * (0.6 + fade * 0.6), p.color, p.glow * fade * 0.55);
    });
    ctx.globalCompositeOperation = "source-over";
    shapes.forEach((s) => { if (!s.under) s.draw(ctx, s.age / s.life, s); });
    parts.forEach((p) => {
      const fade = 1 - p.age / p.life;
      ctx.globalAlpha = p.fade === false ? 1 : Math.min(1, fade * 1.6);
      ctx.fillStyle = p.color;
      const sz = Math.max(1, Math.round(p.size * (p.shrink ? fade : 1)));
      const x = Math.round(p.x - sz / 2);
      const y = Math.round(p.y - sz / 2);
      if (p.shape === "plus") {
        ctx.fillRect(x - 1, y, sz + 2, sz);
        ctx.fillRect(x, y - 1, sz, sz + 2);
      } else if (p.shape === "star") {
        ctx.fillRect(x, y - 2, 1, 5);
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, 1, 1);
      } else if (p.shape === "streak") {
        ctx.fillRect(x, y, sz, 1);
        ctx.fillRect(Math.round(x - p.vx * 2), Math.round(y - p.vy * 2), sz, 1);
      } else {
        ctx.fillRect(x, y, sz, sz);
      }
    });
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function clear() {
    parts.length = 0;
    shapes.length = 0;
  }

  /* ── 기본 효과 ── */
  function burst(x, y, opts) {
    const o = Object.assign({ n: 14, speed: 2.2, colors: [C.white], life: 420, size: 1, glow: 0.7, gravity: 0, up: 0 }, opts);
    for (let i = 0; i < o.n; i++) {
      const a = rand(0, Math.PI * 2);
      const v = rand(o.speed * 0.3, o.speed);
      add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - o.up, ay: o.gravity, drag: 0.9, life: rand(o.life * 0.6, o.life), color: pick(o.colors), size: o.size + (Math.random() < 0.3 ? 1 : 0), glow: o.glow, shape: o.shape });
    }
  }

  function sparkle(x, y, color, n) {
    for (let i = 0; i < (n || 6); i++) {
      add({ x: x + rand(-14, 14), y: y + rand(-20, 6), vy: rand(-0.6, -0.2), life: rand(400, 800), color: color || C.white, shape: "star", glow: 0.8, glowR: 5 });
    }
  }

  function ring(x, y, color, opts) {
    const o = Object.assign({ r0: 4, r1: 30, life: 380, flat: 0.45, width: 2 }, opts);
    return addShape({
      life: o.life, under: o.under,
      draw(ctx, t) {
        const r = o.r0 + (o.r1 - o.r0) * easeOut(t);
        ctx.save();
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = color;
        ctx.lineWidth = o.width;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * o.flat, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (1 - t) * 0.5;
        ctx.lineWidth = o.width + 3;
        ctx.stroke();
        ctx.restore();
      }
    });
  }
  const easeOut = (t) => 1 - (1 - t) * (1 - t);

  function flash(color, life) {
    return addShape({
      life: life || 160, screen: true,
      draw(ctx, t) {
        ctx.save();
        ctx.globalAlpha = (1 - t) * 0.35;
        ctx.fillStyle = color || "#ffffff";
        ctx.fillRect(-10, -10, ctx.canvas.width + 20, ctx.canvas.height + 20);
        ctx.restore();
      }
    });
  }

  /* ── 투사체 ── */
  function projectile(from, to, opts) {
    const o = Object.assign({ speed: 5, color: C.orange, size: 3, glow: 1, trail: 0.8, trailColors: null, arc: 0, shape: null, glowR: 8 }, opts);
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const travel = (dist / o.speed) * 16.67;
    return new Promise((res) => {
      const p = add({
        x: from[0], y: from[1], vx: ((to[0] - from[0]) / travel) * 16.67, vy: ((to[1] - from[1]) / travel) * 16.67,
        ay: 0, life: travel + 50, travel, target: to, color: o.color, size: o.size, glow: o.glow, glowR: o.glowR, trail: o.trail, trailColors: o.trailColors, fade: false, shape: o.shape,
        onHit: res
      });
      if (o.arc) { p.vy -= o.arc; p.ay = (2 * o.arc) / (travel / 16.67); }
    });
  }

  /* ── 원소 연출 ── */
  function slash(x, y, color, big) {
    const col = color || C.white;
    const n = big ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const flip = k % 2 ? -1 : 1;
      addShape({
        life: 240,
        draw(ctx, t) {
          ctx.save();
          ctx.translate(x, y);
          ctx.scale(flip, 1);
          const span = Math.PI * 0.9 * easeOut(Math.min(1, t * 1.6));
          const r = big ? 24 : 17;
          ctx.globalAlpha = 1 - t;
          ctx.lineCap = "square";
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = hexA(col, 0.5);
          ctx.lineWidth = 6;
          ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI * 0.95, -Math.PI * 0.95 + span); ctx.stroke();
          ctx.globalCompositeOperation = "source-over";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, r, -Math.PI * 0.95, -Math.PI * 0.95 + span); ctx.stroke();
          ctx.restore();
        }
      });
    }
    burst(x, y, { n: 10, colors: [col, C.white, C.yellow], speed: 2.4, life: 300 });
  }

  function claw(x, y, color) {
    const col = color || C.red;
    addShape({
      life: 280,
      draw(ctx, t) {
        ctx.save();
        ctx.globalAlpha = 1 - t;
        const g = Math.min(1, t * 3);
        for (let i = 0; i < 3; i++) {
          const ox = x - 10 + i * 8;
          ctx.fillStyle = col;
          for (let s = 0; s < 18 * g; s++) ctx.fillRect(Math.round(ox + s * 0.6), Math.round(y - 12 + s), 2, 2);
          ctx.fillStyle = "#ffffff";
          for (let s = 0; s < 18 * g; s += 2) ctx.fillRect(Math.round(ox + s * 0.6), Math.round(y - 12 + s), 1, 1);
        }
        ctx.restore();
      }
    });
    burst(x, y, { n: 8, colors: [col, C.white], speed: 2, life: 260 });
  }

  function explosion(x, y, colors, size) {
    const s = size || 1;
    ring(x, y, colors[0], { r1: 26 * s, life: 360 });
    burst(x, y, { n: Math.round(26 * s), colors, speed: 3.2 * s, life: 520, size: 2, gravity: 0.05, up: 0.6 });
    for (let i = 0; i < 8 * s; i++) add({ x: x + rand(-8, 8), y: y + rand(-6, 4), vx: rand(-0.4, 0.4), vy: rand(-0.9, -0.3), life: rand(500, 900), color: pick(["#4a4458", "#3a3446", "#5a5468"]), size: 3, drag: 0.97 });
  }

  function fireball(from, to, big) {
    const colors = [C.yellow, C.orange, C.red];
    return projectile(from, to, { color: C.yellow, size: big ? 6 : 4, glowR: big ? 16 : 10, speed: 5.2, trail: 0.95, trailColors: colors }).then(() => {
      explosion(to[0], to[1], colors, big ? 1.6 : 1);
    });
  }

  function iceSpikes(x, y, big) {
    const count = big ? 7 : 4;
    const spikes = [];
    for (let i = 0; i < count; i++) {
      spikes.push({ dx: rand(-20, 20) * (big ? 1.4 : 1), h: rand(16, big ? 42 : 28), w: rand(4, 8), delay: i * 0.06 });
    }
    addShape({
      life: 700,
      draw(ctx, t) {
        ctx.save();
        spikes.forEach((sp) => {
          const g = Math.max(0, Math.min(1, (t - sp.delay) * 4));
          const fade = t > 0.75 ? 1 - (t - 0.75) * 4 : 1;
          if (g <= 0) return;
          const bx = x + sp.dx;
          const top = y - sp.h * g;
          ctx.globalAlpha = fade;
          ctx.fillStyle = "#7fd6ff";
          ctx.beginPath(); ctx.moveTo(bx - sp.w, y); ctx.lineTo(bx, top); ctx.lineTo(bx, y); ctx.fill();
          ctx.fillStyle = "#c8f0ff";
          ctx.beginPath(); ctx.moveTo(bx, top); ctx.lineTo(bx + sp.w, y); ctx.lineTo(bx, y); ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(Math.round(bx), Math.round(top), 1, Math.round(sp.h * g * 0.6));
          ctx.globalCompositeOperation = "lighter";
          glowDot(ctx, bx, top + 4, 8, C.cyan, 0.4 * fade);
          ctx.globalCompositeOperation = "source-over";
        });
        ctx.restore();
      }
    });
    sleep(500).then(() => burst(x, y - 12, { n: 18, colors: [C.cyan, C.white, "#7fd6ff"], speed: 2.6, gravity: 0.08, life: 500 }));
    for (let i = 0; i < 12; i++) add({ x: x + rand(-30, 30), y: y - rand(30, 60), vy: rand(0.3, 0.8), vx: rand(-0.2, 0.2), life: rand(500, 900), color: C.white, size: 1, glow: 0.6 });
    return sleep(220);
  }

  function lightning(x1, y1, x2, y2, color, life) {
    const col = color || "#b3a6ff";
    let pts = [];
    const remake = () => {
      pts = [[x1, y1]];
      const n = 9;
      for (let i = 1; i < n; i++) {
        const t = i / n;
        pts.push([x1 + (x2 - x1) * t + rand(-7, 7), y1 + (y2 - y1) * t + rand(-4, 4)]);
      }
      pts.push([x2, y2]);
    };
    remake();
    let last = 0;
    addShape({
      life: life || 360,
      draw(ctx, t, s) {
        if (s.age - last > 50) { remake(); last = s.age; }
        ctx.save();
        ctx.globalAlpha = 1 - t * 0.6;
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexA(col, 0.6);
        ctx.lineWidth = 5;
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke();
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    });
    burst(x2, y2, { n: 16, colors: [col, C.white, C.yellow], speed: 2.8, life: 360 });
    flash(col, 120);
  }

  function boltStrike(x, y, big) {
    const n = big ? 4 : 1;
    const jobs = [];
    for (let i = 0; i < n; i++) {
      jobs.push(sleep(i * 120).then(() => lightning(x + rand(-14, 14) * (big ? 1 : 0), y - 110, x + rand(-6, 6), y, C.yellow, 300)));
    }
    return sleep(n * 120);
  }

  function holyPillar(x, y, big) {
    const w = big ? 26 : 14;
    addShape({
      life: 700,
      draw(ctx, t) {
        const g = t < 0.2 ? t / 0.2 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
        grad.addColorStop(0, "rgba(255,240,180,0)");
        grad.addColorStop(0.5, `rgba(255,250,220,${0.75 * g})`);
        grad.addColorStop(1, "rgba(255,240,180,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(x - w, 0, w * 2, y + 6);
        ctx.fillStyle = `rgba(255,255,255,${0.9 * g})`;
        ctx.fillRect(Math.round(x - 1), 0, 2, Math.round(y));
        ctx.restore();
      }
    });
    for (let i = 0; i < 20; i++) add({ x: x + rand(-w, w), y: y - rand(0, 10), vy: rand(-1.4, -0.5), life: rand(500, 900), color: pick([C.yellow, C.white, C.gold]), shape: i % 3 ? null : "star", glow: 0.8 });
    ring(x, y, C.yellow, { r1: w * 2, life: 500 });
    return sleep(200);
  }

  function darkOrbs(from, to, big) {
    const colors = [C.magenta, C.purple, "#2a1438"];
    const n = big ? 6 : 3;
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push(sleep(i * 70).then(() => projectile([from[0] + rand(-6, 6), from[1] + rand(-10, 4)], [to[0] + rand(-6, 6), to[1] + rand(-8, 8)], { color: C.magenta, size: 3, speed: 4.2, arc: rand(-3, 3), trail: 0.8, trailColors: colors, glowR: 9 })));
    }
    return Promise.all(list).then(() => {
      ring(to[0], to[1], C.magenta, { r0: 30, r1: 2, life: 300 });
      burst(to[0], to[1], { n: 20, colors, speed: 2.4, life: 480 });
    });
  }

  function arcane(from, to, big) {
    const colors = [C.pink, "#b3a6ff", C.white];
    const n = big ? 7 : 4;
    const list = [];
    for (let i = 0; i < n; i++) {
      list.push(sleep(i * 60).then(() => projectile([from[0], from[1] - 8], [to[0] + rand(-6, 6), to[1] + rand(-8, 6)], { color: C.white, shape: "star", size: 1, speed: 4.5, arc: rand(2, 5) * (i % 2 ? 1 : -1), trail: 0.9, trailColors: colors, glowR: 8 })));
    }
    return Promise.all(list).then(() => { burst(to[0], to[1], { n: 18, colors, speed: 2.4, life: 420 }); ring(to[0], to[1], C.pink, { r1: 24 }); });
  }

  function earth(x, y, big) {
    const rocks = [];
    for (let i = 0; i < (big ? 8 : 5); i++) rocks.push({ dx: rand(-22, 22), s: rand(4, 9), d: i * 0.05 });
    addShape({
      life: 650,
      draw(ctx, t) {
        ctx.save();
        rocks.forEach((r) => {
          const g = Math.max(0, Math.min(1, (t - r.d) * 3.5));
          if (!g) return;
          const yy = y - Math.sin(Math.min(1, g) * Math.PI) * 30 * (1 - t * 0.3);
          ctx.globalAlpha = t > 0.8 ? (1 - t) * 5 : 1;
          ctx.fillStyle = "#6e4a32";
          ctx.fillRect(Math.round(x + r.dx - r.s / 2), Math.round(yy - r.s / 2), Math.round(r.s), Math.round(r.s));
          ctx.fillStyle = "#a8754a";
          ctx.fillRect(Math.round(x + r.dx - r.s / 2), Math.round(yy - r.s / 2), Math.round(r.s - 2), 2);
        });
        ctx.restore();
      }
    });
    for (let i = 0; i < 14; i++) add({ x: x + rand(-26, 26), y: y + rand(-2, 2), vx: rand(-0.5, 0.5), vy: rand(-0.8, -0.2), life: rand(500, 900), color: pick(["#8a6a4a", "#a8875e", "#6e5a44"]), size: 2, drag: 0.96 });
    return sleep(240);
  }

  function tornado(x, y, big) {
    const h = big ? 70 : 46;
    addShape({
      life: 800,
      draw(ctx, t, s) {
        ctx.save();
        ctx.globalAlpha = t > 0.75 ? (1 - t) * 4 : 1;
        for (let i = 0; i < 10; i++) {
          const yy = y - (i / 10) * h;
          const r = 5 + i * (big ? 2.4 : 1.6);
          const ph = s.age * 0.02 + i;
          ctx.strokeStyle = i % 2 ? "#9fe8c8" : "#e8fff4";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.ellipse(x + Math.sin(ph) * 2, yy, r, r * 0.25, 0, ph % (Math.PI * 2), ph % (Math.PI * 2) + Math.PI * 1.3); ctx.stroke();
        }
        ctx.restore();
      }
    });
    for (let i = 0; i < 12; i++) add({ x: x + rand(-20, 20), y: y - rand(0, h), vx: rand(-1.5, 1.5), vy: rand(-1, 0), life: rand(500, 800), color: pick([C.green, "#9fe8c8"]), size: 2 });
    return sleep(260);
  }

  function vines(x, y, big) {
    const vs = [];
    for (let i = 0; i < (big ? 6 : 3); i++) vs.push({ dx: rand(-16, 16), h: rand(18, big ? 46 : 32), sway: rand(-8, 8) });
    addShape({
      life: 700,
      draw(ctx, t) {
        ctx.save();
        ctx.globalAlpha = t > 0.75 ? (1 - t) * 4 : 1;
        vs.forEach((v) => {
          const g = Math.min(1, t * 3);
          for (let s = 0; s < v.h * g; s++) {
            const px = x + v.dx + Math.sin(s * 0.25) * 2 + (v.sway * s) / v.h;
            ctx.fillStyle = s % 5 === 0 ? C.green : "#2f7a3a";
            ctx.fillRect(Math.round(px), Math.round(y - s), 2, 1);
            if (s % 7 === 3) { ctx.fillStyle = C.green; ctx.fillRect(Math.round(px + 2), Math.round(y - s), 2, 2); }
          }
        });
        ctx.restore();
      }
    });
    for (let i = 0; i < 10; i++) add({ x: x + rand(-14, 14), y: y - rand(0, 20), vy: rand(-0.7, -0.2), life: rand(500, 900), color: pick([C.green, "#b6f27a"]), size: 2, glow: 0.4 });
    return sleep(220);
  }

  function poisonCloud(x, y) {
    for (let i = 0; i < 16; i++) add({ x: x + rand(-14, 14), y: y + rand(-14, 6), vx: rand(-0.3, 0.3), vy: rand(-0.6, -0.1), life: rand(500, 900), color: pick([C.green, "#8ad24a", C.purple]), size: rand(2, 4), glow: 0.5, drag: 0.98 });
  }

  function heal(x, y, color) {
    const col = color || C.green;
    for (let i = 0; i < 16; i++) add({ x: x + rand(-12, 12), y: y + rand(-6, 10), vy: rand(-1.1, -0.4), life: rand(500, 900), color: i % 3 ? col : C.white, shape: "plus", size: 1, glow: 0.8, glowR: 6 });
    ring(x, y + 14, col, { r1: 22, life: 500 });
  }

  function shield(x, y) {
    addShape({
      life: 650,
      draw(ctx, t) {
        ctx.save();
        ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          const b = ((k + 1) / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * 22, y + Math.sin(a) * 26);
          ctx.lineTo(x + Math.cos(b) * 22, y + Math.sin(b) * 26);
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "lighter";
        glowDot(ctx, x, y, 26, C.cyan, 0.25);
        ctx.restore();
      }
    });
  }

  function buff(x, y, color) {
    const col = color || C.yellow;
    ring(x, y + 18, col, { r1: 20, life: 520, under: true });
    for (let i = 0; i < 10; i++) add({ x: x + rand(-12, 12), y: y + rand(0, 16), vy: rand(-1.4, -0.7), life: rand(400, 700), color: col, size: 2, glow: 0.7 });
  }

  function coins(x, y) {
    burst(x, y, { n: 12, colors: [C.gold, C.yellow], speed: 2.6, gravity: 0.15, up: 1.4, life: 600, size: 2 });
  }

  function statusPuff(x, y, kind) {
    const map = { burn: [C.orange, C.red], poison: [C.green, C.purple], bleed: [C.red, C.dred], curse: [C.magenta, C.purple], stun: [C.yellow, C.white], freeze: [C.cyan, C.white], charm: [C.pink, C.magenta], debuff: [C.purple, C.slate], enrage: [C.red, C.orange] };
    const cols = map[kind] || [C.white];
    for (let i = 0; i < 10; i++) add({ x: x + rand(-12, 12), y: y + rand(-12, 8), vy: rand(-0.8, -0.2), life: rand(400, 700), color: pick(cols), size: 2, glow: 0.5 });
    if (kind === "stun" || kind === "freeze") sparkle(x, y - 20, cols[0], 5);
  }

  /* 마법진: 궁극기 준비 */
  function magicCircle(x, y, color, life) {
    const col = color || C.lblue;
    return addShape({
      life: life || 1100, under: true,
      draw(ctx, t, s) {
        const g = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;
        const rot = s.age * 0.002;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = g;
        ctx.strokeStyle = col;
        ctx.lineWidth = 1;
        [36, 28, 18].forEach((r, i) => { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke(); if (i === 0) { ctx.lineWidth = 3; ctx.strokeStyle = hexA(col, 0.4); ctx.stroke(); ctx.lineWidth = 1; ctx.strokeStyle = col; } });
        ctx.beginPath();
        for (let k = 0; k <= 5; k++) {
          const a = rot + (k * 4 * Math.PI) / 5;
          const px = x + Math.cos(a) * 28;
          const py = y + Math.sin(a) * 28 * 0.32;
          if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        for (let k = 0; k < 12; k++) {
          const a = -rot * 1.5 + (k / 12) * Math.PI * 2;
          ctx.fillRect(Math.round(x + Math.cos(a) * 32), Math.round(y + Math.sin(a) * 32 * 0.32), 1, 1);
        }
        glowDot(ctx, x, y, 40, col, 0.18 * g);
        ctx.restore();
      }
    });
  }

  function meteors(x, y, n) {
    const list = [];
    for (let i = 0; i < (n || 5); i++) {
      const tx = x + rand(-26, 26);
      const ty = y + rand(-6, 8);
      list.push(sleep(i * 140).then(() => projectile([tx + 70, ty - 140], [tx, ty], { color: C.yellow, size: 5, glowR: 14, speed: 7, trail: 1, trailColors: [C.orange, C.red, C.yellow] }).then(() => explosion(tx, ty, [C.yellow, C.orange, C.red], 1.1))));
    }
    return Promise.all(list);
  }

  function starRain(x, y, n) {
    const list = [];
    for (let i = 0; i < (n || 8); i++) {
      const tx = x + rand(-26, 26);
      list.push(sleep(i * 70).then(() => projectile([tx + rand(-30, 30), y - 130], [tx, y + rand(-10, 6)], { color: C.white, shape: "star", size: 1, speed: 7, trail: 1, trailColors: [C.pink, "#b3a6ff", C.cyan], glowR: 9 }).then(() => burst(tx, y, { n: 6, colors: [C.white, C.pink], speed: 1.8, life: 300 }))));
    }
    return Promise.all(list);
  }

  function blackHole(x, y) {
    addShape({
      life: 1000,
      draw(ctx, t) {
        const r = t < 0.6 ? 4 + t * 30 : (1 - t) * 55;
        ctx.save();
        ctx.fillStyle = "#05010a";
        ctx.beginPath(); ctx.arc(x, y, Math.max(0, r * 0.6), 0, Math.PI * 2); ctx.fill();
        ctx.globalCompositeOperation = "lighter";
        glowDot(ctx, x, y, r * 1.6 + 4, C.magenta, 0.5);
        ctx.restore();
      }
    });
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      const d = rand(30, 60);
      add({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.7, vx: -Math.cos(a) * d / 40, vy: -Math.sin(a) * d * 0.7 / 40, life: 700, color: pick([C.magenta, C.purple, C.white]), size: 1, glow: 0.6 });
    }
    return sleep(700).then(() => { burst(x, y, { n: 30, colors: [C.magenta, C.white, C.purple], speed: 3.4, life: 500 }); flash(C.magenta, 160); });
  }

  /* ── 도트 숫자 ── */
  const GLYPH = {
    "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"],
    "3": ["111", "001", "011", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
    "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
    "9": ["111", "101", "111", "001", "111"], "+": ["000", "010", "111", "010", "000"], "-": ["000", "000", "111", "000", "000"],
    "!": ["1", "1", "1", "0", "1"], M: ["10001", "11011", "10101", "10001", "10001"], I: ["111", "010", "010", "010", "111"],
    S: ["111", "100", "111", "001", "111"], C: ["111", "100", "100", "100", "111"], R: ["110", "101", "110", "101", "101"],
    T: ["111", "010", "010", "010", "010"], A: ["010", "101", "111", "101", "101"], L: ["100", "100", "100", "100", "111"],
    W: ["10001", "10001", "10101", "11011", "10001"], E: ["111", "100", "111", "100", "111"], K: ["101", "110", "100", "110", "101"],
    G: ["111", "100", "101", "101", "111"], P: ["110", "101", "110", "100", "100"], " ": ["0", "0", "0", "0", "0"]
  };
  function textWidth(str, scale) {
    return str.split("").reduce((w, ch) => w + ((GLYPH[ch] || GLYPH[" "])[0].length + 1) * scale, -scale);
  }
  function pixelText(ctx, str, x, y, color, scale, outline) {
    const s = scale || 1;
    const draw = (ox, oy, col) => {
      ctx.fillStyle = col;
      let cx = Math.round(x + ox);
      str.split("").forEach((ch) => {
        const g = GLYPH[ch] || GLYPH[" "];
        g.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) if (row[rx] === "1") ctx.fillRect(cx + rx * s, Math.round(y + oy) + ry * s, s, s); });
        cx += (g[0].length + 1) * s;
      });
    };
    if (outline !== false) [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]].forEach(([ox, oy]) => draw(ox, oy, "#120c20"));
    draw(0, 0, color);
  }

  const pops = [];
  function pop(x, y, text, color, big) {
    pops.push({ x, y, text, color, big, age: 0, life: 900, vx: rand(-0.3, 0.3) });
  }
  function updatePops(dt) {
    for (let i = pops.length - 1; i >= 0; i--) {
      pops[i].age += dt;
      if (pops[i].age > pops[i].life) pops.splice(i, 1);
    }
  }
  function drawPops(ctx) {
    pops.forEach((p) => {
      const t = p.age / p.life;
      const rise = t < 0.2 ? -t * 50 : -10 - t * 8;
      const s = p.big ? 2 : 1;
      const bounce = t < 0.15 ? 1 + (0.15 - t) * 3 : 1;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      const sc = Math.max(1, Math.round(s * bounce));
      pixelText(ctx, p.text, p.x - textWidth(p.text, sc) / 2 + p.vx * p.age * 0.05, p.y + rise, p.color, sc);
      ctx.globalAlpha = 1;
    });
  }

  /* 원소별 공격 연출: from(시전자) → to(대상). big=true면 궁극기급 */
  function elementAttack(el, from, to, big, ranged) {
    switch (el) {
      case "fire": return big ? meteors(to[0], to[1], 5) : fireball(from, to, false);
      case "ice": return iceSpikes(to[0], to[1] + 20, big);
      case "bolt": return big ? boltStrike(to[0], to[1], true) : Promise.resolve(lightning(from[0], from[1], to[0], to[1], C.yellow, 300));
      case "earth": return earth(to[0], to[1] + 18, big);
      case "wind": return tornado(to[0], to[1] + 20, big);
      case "light": return holyPillar(to[0], to[1] + 18, big);
      case "dark": return big ? blackHole(to[0], to[1]) : darkOrbs(from, to, false);
      case "nature": return vines(to[0], to[1] + 20, big).then(() => poisonCloud(to[0], to[1]));
      case "arcane": return big ? starRain(to[0], to[1], 10) : arcane(from, to, false);
      default:
        if (ranged) return projectile(from, to, { color: C.white, size: 1, speed: 9, shape: "streak", trail: 0.4, trailColors: [C.lgrey], glowR: 4 }).then(() => burst(to[0], to[1], { n: 10, colors: [C.white, C.yellow], speed: 2, life: 260 }));
        slash(to[0], to[1], C.white, big);
        return sleep(80);
    }
  }

  /* ── 굵은 도트 배율 ──
     전투 화면에서는 효과를 K배 굵은 도트로 그린다. 바깥 좌표를 1/K로 받아 작은 판에 그린 뒤
     최근접 보간으로 K배 키우므로 입자 크기·퍼짐·마법진 반지름이 모두 함께 커진다. */
  let K = 1;
  let layer = null;
  function setScale(k) {
    if (k === K) return;
    K = k;
    clear();
  }
  function drawScaled(ctx) {
    if (K === 1) { draw(ctx); return; }
    const w = Math.ceil(ctx.canvas.width / K);
    const h = Math.ceil(ctx.canvas.height / K);
    if (!layer || layer.width !== w || layer.height !== h) layer = S.makeCanvas(w, h);
    const lc = layer.getContext("2d");
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.clearRect(0, 0, w, h);
    /* 카메라 이동(translate)이 걸려 있으면 작은 판에도 같은 이동을 1/K로 건다 */
    const m = ctx.getTransform();
    lc.setTransform(1, 0, 0, 1, Math.round(m.e / K), Math.round(m.f / K));
    draw(lc);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer, 0, 0, w * K, h * K);
    ctx.restore();
  }
  const pt = (a) => [a[0] / K, a[1] / K];
  const atXY = (fn) => (x, y, ...rest) => fn(x / K, y / K, ...rest);
  const fromTo = (fn) => (from, to, ...rest) => fn(pt(from), pt(to), ...rest);

  F.fx = {
    sleep, tick, flushTimers, update, draw: drawScaled, clear, setScale, addShape, flash, pixelText, textWidth, pop, updatePops, drawPops,
    glowDot, hexA, shapes,
    add: (p) => { p.x /= K; p.y /= K; return add(p); },
    lightning: (x1, y1, x2, y2, ...rest) => lightning(x1 / K, y1 / K, x2 / K, y2 / K, ...rest),
    elementAttack: (el, from, to, ...rest) => elementAttack(el, pt(from), pt(to), ...rest),
    projectile: fromTo(projectile), fireball: fromTo(fireball), darkOrbs: fromTo(darkOrbs), arcane: fromTo(arcane),
    burst: atXY(burst), sparkle: atXY(sparkle), ring: atXY(ring), slash: atXY(slash), claw: atXY(claw), explosion: atXY(explosion),
    iceSpikes: atXY(iceSpikes), boltStrike: atXY(boltStrike), holyPillar: atXY(holyPillar), earth: atXY(earth), tornado: atXY(tornado),
    vines: atXY(vines), poisonCloud: atXY(poisonCloud), heal: atXY(heal), shield: atXY(shield), buff: atXY(buff), coins: atXY(coins),
    statusPuff: atXY(statusPuff), magicCircle: atXY(magicCircle), meteors: atXY(meteors), starRain: atXY(starRain), blackHole: atXY(blackHole)
  };
})(typeof window !== "undefined" ? window : globalThis);
