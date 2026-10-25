/*
 * 삼천의 운명 — 주인공 그림과 동작
 * 미리 그린 캐릭터 그림(오른쪽을 봄)을 원하는 키로 줄여 두고, 발밑을 축으로 기울이기·늘이기·눌림으로
 * 대기(숨쉬기)·걷기·점프·낙하·착지·공격(뒤로 젖혔다 내지르기)·시전·피격 동작을 만든다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const H = F.heroes;

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

  /* 원하는 키(px)로 부드럽게 줄인 그림. 줄이기는 한 번만 한다 */
  const scaled = new Map();
  function sprite(job, heightPx) {
    const id = H.heroArtId(job);
    const img = image(id);
    if (!img.complete || !img.naturalWidth) return null;
    const hpx = Math.max(8, Math.round(heightPx));
    const key = `${id}@${hpx}`;
    let cv = scaled.get(key);
    if (!cv) {
      const k = hpx / img.naturalHeight;
      cv = F.sprites.makeCanvas(Math.max(1, Math.round(img.naturalWidth * k)), hpx);
      const g = cv.getContext("2d");
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, 0, 0, cv.width, cv.height);
      if (scaled.size > 300) scaled.clear();
      scaled.set(key, cv);
    }
    return cv;
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

  /* 발밑(x, y)에 그린다. o: dir(1 오른쪽, -1 왼쪽), anim, t, f, h(키 px), alpha, tint */
  function draw(ctx, job, x, y, o) {
    const cv = sprite(job, o.h);
    if (!cv) return drawDoll(ctx, job, x, y, o);
    const m = motion(o.anim, o.t || 0, o.f || 0);
    ctx.save();
    ctx.translate(Math.round(x + m.dx * o.h * (o.dir || 1)), Math.round(y + m.dy * o.h));
    ctx.scale((o.dir || 1) * m.sx, m.sy);
    ctx.rotate(m.rot);
    ctx.imageSmoothingEnabled = true;
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.drawImage(cv, -Math.round(cv.width * 0.46), -cv.height);
    if (o.tint) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = o.tintA || 0.5;
      ctx.fillStyle = o.tint;
      ctx.fillRect(-cv.width, -cv.height, cv.width * 2, cv.height);
    }
    ctx.restore();
    return { w: cv.width, h: cv.height, hand: [x + (o.dir || 1) * cv.width * 0.36, y - cv.height * 0.45] };
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

  /* 도감·결과 창 같은 DOM 그림 */
  function url(job) {
    return src(H.heroArtId(job));
  }

  F.heroArt = { preload, sprite, draw, url, image, motion };
})(typeof window !== "undefined" ? window : globalThis);
