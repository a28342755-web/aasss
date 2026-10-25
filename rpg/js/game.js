/*
 * 삼천의 운명 — 게임 진행
 * 화면 하나(캔버스) 위에 장면(타이틀·운명 뽑기·필드·전투)을 그리고, 글자가 필요한 창은 DOM으로 띄운다.
 */
(function (root) {
  "use strict";
  const F = root.FATES;
  const D = F.data;
  const E = F.engine;
  const S = F.sprites;
  const Dl = F.doll;
  const Wd = F.world;
  const X = F.fx;
  const C = S.C;
  const J = E.J;
  const doc = root.document;
  const $ = (id) => doc.getElementById(id);
  const fmt = (n) => Math.round(n).toLocaleString("ko-KR");
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  const rarName = (r) => D.RARITIES[r].name;
  const famOf = (job) => F.FAMILY_LIST[job.fam];
  const jobNo = (id) => "No." + String(id).padStart(4, "0");
  const TS = Wd.TS;
  const reduceMotion = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);

  /* ── 저장 ── */
  const PREFIX = "fates3000:";
  const store = {
    get(key, fallback) {
      try { const raw = root.localStorage.getItem(PREFIX + key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; }
    },
    set(key, value) { try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (err) { /* 저장 불가 */ } },
    del(key) { try { root.localStorage.removeItem(PREFIX + key); } catch (err) { /* 저장 불가 */ } }
  };

  const G = {
    scene: null, player: null, place: "town", tokens: 0, codex: new Set(), hall: [], roll: null,
    busy: 0, fast: false, t: 0
  };

  /* 저장된 직업은 번호로만 기억하고, 불러올 때 현재 데이터로 다시 연결한다 */
  function packPlayer(p) {
    const o = Object.assign({}, p);
    o.jobId = p.job.id;
    delete o.job;
    return o;
  }
  function unpackPlayer(o) {
    if (!o) return null;
    const p = Object.assign({}, o);
    p.job = F.jobById(o.jobId || (o.job && o.job.id)) || F.JOBS[0];
    return p;
  }
  function save(extra) {
    if (!G.player || G.player.hp <= 0) return;
    store.set("save", Object.assign({ player: packPlayer(G.player), place: G.place }, extra || {}));
  }
  function discover(job) {
    if (G.codex.has(job.id)) return;
    G.codex.add(job.id);
    store.set("codex", Array.from(G.codex));
  }

  /* ── 화면 ── */
  const cv = $("cv");
  const ctx = cv.getContext("2d");
  let VW = 360;
  let VH = 480;
  let SCALE = 1;
  const touch = !!(root.matchMedia && root.matchMedia("(pointer: coarse)").matches) || "ontouchstart" in root;

  function resize() {
    const pad = $("pad");
    pad.hidden = !touch;
    $("keys-hint").hidden = touch;
    const reserve = touch ? 176 : 34;
    const aw = Math.min(root.innerWidth, 1200);
    const ah = Math.max(320, root.innerHeight - reserve);
    SCALE = Math.max(1, Math.min(Math.floor(aw / 330), Math.floor(ah / 300)));
    VW = Math.min(560, Math.floor(aw / SCALE));
    VH = Math.min(680, Math.floor(ah / SCALE));
    cv.width = VW;
    cv.height = VH;
    const screen = $("screen");
    screen.style.width = VW * SCALE + "px";
    screen.style.height = VH * SCALE + "px";
    screen.style.setProperty("--s", SCALE);
    ctx.imageSmoothingEnabled = false;
  }

  /* ── 입력 ── */
  const held = { up: false, down: false, left: false, right: false };
  let lastDir = null;
  const KEYMAP = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
    Enter: "a", Space: "a", KeyZ: "a", Escape: "b", KeyX: "b", Backspace: "b"
  };
  function press(k) {
    if (k === "a" && G.scene === Battle && Battle.mode === "anim") { G.fast = true; return; }
    if (winTop()) { winKey(k); return; }
    if (G.scene && G.scene.key) G.scene.key(k);
  }
  doc.addEventListener("keydown", (ev) => {
    const tag = (ev.target && ev.target.tagName) || "";
    const typing = tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    const k = KEYMAP[ev.code];
    if (!k) return;
    if (typing && k !== "b" && !(k === "a" && ev.code === "Enter")) return;
    if (typing && ev.code === "Backspace") return;
    ev.preventDefault();
    if (held[k] !== undefined) {
      if (!held[k]) { held[k] = true; lastDir = k; if (winTop()) winKey(k); }
      return;
    }
    if (!ev.repeat) press(k);
  });
  doc.addEventListener("keyup", (ev) => {
    const k = KEYMAP[ev.code];
    if (k && held[k] !== undefined) held[k] = false;
  });
  root.addEventListener("blur", () => { Object.keys(held).forEach((k) => { held[k] = false; }); });

  function bindPad() {
    doc.querySelectorAll("#pad [data-k]").forEach((btn) => {
      const k = btn.dataset.k;
      const down = (ev) => {
        ev.preventDefault();
        btn.classList.add("on");
        if (held[k] !== undefined) { held[k] = true; lastDir = k; if (winTop()) winKey(k); }
        else press(k);
      };
      const up = (ev) => {
        ev.preventDefault();
        btn.classList.remove("on");
        if (held[k] !== undefined) held[k] = false;
      };
      btn.addEventListener("pointerdown", down);
      btn.addEventListener("pointerup", up);
      btn.addEventListener("pointercancel", up);
      btn.addEventListener("pointerleave", up);
      btn.addEventListener("contextmenu", (ev) => ev.preventDefault());
    });
  }
  function heldDir() {
    if (lastDir && held[lastDir]) return lastDir;
    return ["up", "down", "left", "right"].find((k) => held[k]) || null;
  }

  /* ── 창(DOM) ── */
  const wins = [];
  function winTop() { return wins[wins.length - 1] || null; }
  /* opts: cls, onBack, onPick(el), keep(창이 닫히지 않음) */
  function openWin(html, opts) {
    const o = opts || {};
    const el = doc.createElement("div");
    el.className = "win " + (o.cls || "win-center");
    el.innerHTML = html;
    $("ui").appendChild(el);
    const w = { el, o, idx: 0 };
    wins.push(w);
    if (o.focus) {
      const i = opts2(w).findIndex((b) => b.dataset.opt === o.focus);
      if (i >= 0) w.idx = i;
    }
    el.addEventListener("click", (ev) => {
      const opt = ev.target.closest("[data-opt]");
      if (!opt || opt.disabled || !el.contains(opt)) return;
      if (winTop() !== w) return;
      w.idx = opts2(w).indexOf(opt);
      focusOpt(w);
      if (o.onPick) o.onPick(opt.dataset.opt, opt, w);
    });
    el.addEventListener("pointermove", (ev) => {
      const opt = ev.target.closest("[data-opt]");
      if (opt && !opt.disabled) { const i = opts2(w).indexOf(opt); if (i >= 0 && i !== w.idx) { w.idx = i; focusOpt(w, true); } }
    });
    focusOpt(w, true);
    return w;
  }
  function opts2(w) {
    return Array.from(w.el.querySelectorAll("[data-opt]")).filter((b) => !b.disabled && b.offsetParent !== null);
  }
  function focusOpt(w, quiet) {
    const list = opts2(w);
    w.el.querySelectorAll(".cur").forEach((b) => b.classList.remove("cur"));
    if (!list.length) return;
    w.idx = Math.max(0, Math.min(list.length - 1, w.idx));
    const b = list[w.idx];
    b.classList.add("cur");
    if (!quiet) b.scrollIntoView({ block: "nearest" });
    if (w.o.onFocus) w.o.onFocus(b.dataset.opt, b, w);
  }
  function closeWin(w) {
    const target = w || winTop();
    if (!target) return;
    const i = wins.indexOf(target);
    if (i >= 0) wins.splice(i, 1);
    target.el.remove();
    if (target.o.onClose) target.o.onClose();
  }
  function closeAll() {
    while (wins.length) { const w = wins.pop(); w.el.remove(); }
  }
  function winKey(k) {
    const w = winTop();
    if (!w) return;
    const list = opts2(w);
    const cols = w.o.cols || 1;
    if (k === "up") { w.idx = Math.max(0, w.idx - cols); focusOpt(w); }
    else if (k === "down") { w.idx = Math.min(list.length - 1, w.idx + cols); focusOpt(w); }
    else if (k === "left" && cols > 1) { w.idx = Math.max(0, w.idx - 1); focusOpt(w); }
    else if (k === "right" && cols > 1) { w.idx = Math.min(list.length - 1, w.idx + 1); focusOpt(w); }
    else if (k === "a") {
      if (w.o.onA) { w.o.onA(w); return; }
      const b = list[w.idx];
      if (b) b.click();
    } else if (k === "b") {
      if (w.o.onBack) w.o.onBack(w);
      else if (!w.o.noBack) closeWin(w);
    }
  }

  /* 대화창: 줄들을 차례로 보여 주고 끝나면 then() */
  function say(lines, then, opts) {
    const list = Array.isArray(lines) ? lines : [lines];
    let i = 0;
    const w = openWin(`<div class="say"><p class="say-text"></p><span class="say-more">▼</span></div>`, {
      cls: "win-bottom" + (opts && opts.cls ? " " + opts.cls : ""), noBack: true,
      onA: () => next()
    });
    const text = w.el.querySelector(".say-text");
    const next = () => {
      if (i >= list.length) { closeWin(w); if (then) then(); return; }
      text.innerHTML = list[i++];
    };
    w.el.addEventListener("click", () => { if (winTop() === w) next(); });
    next();
    return w;
  }

  function ask(question, choices, then) {
    const html = `<p class="ask-q">${question}</p><div class="opts">${choices.map((c, i) => `<button type="button" class="opt" data-opt="${i}">${c}</button>`).join("")}</div>`;
    const w = openWin(html, {
      cls: "win-bottom", onPick: (v) => { closeWin(w); then(Number(v)); },
      onBack: () => { closeWin(w); then(choices.length - 1); }
    });
    return w;
  }

  /* ── 화면 전환 ── */
  function fade(mid) {
    const f = $("fade");
    G.busy++;
    f.classList.add("on");
    setTimeout(() => {
      try { mid(); } finally {
        setTimeout(() => { f.classList.remove("on"); G.busy = Math.max(0, G.busy - 1); }, 60);
      }
    }, reduceMotion ? 10 : 240);
  }
  function setScene(sc, arg) {
    if (G.scene && G.scene.leave) G.scene.leave();
    G.scene = sc;
    X.clear();
    X.setScale(sc.fxScale || 1);
    $("hud").innerHTML = "";
    $("hud").className = "";
    if (sc.enter) sc.enter(arg);
  }

  /* ── 공통 그리기 ── */
  function drawSprite(img, x, y, alpha) {
    if (!img) return;
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, Math.round(x), Math.round(y));
    ctx.globalAlpha = 1;
  }
  function shadow(x, y, rx, ry, a) {
    ctx.save();
    ctx.fillStyle = `rgba(8,4,20,${a === undefined ? 0.35 : a})`;
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  function portraitURL(famId) {
    return (F.PORTRAITS && F.PORTRAITS[famId]) || `assets/portraits/${famId}.webp`;
  }
  const thumbCache = new Map();
  function thumb(job, dir, scale) {
    const key = `${job.id}${dir}${scale}`;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const fr = Dl.frame(job, dir || "down", "idle", 0, scale || 1);
    const url = fr.cv.toDataURL();
    thumbCache.set(key, url);
    return url;
  }

  /* 별이 빛나는 밤하늘(타이틀·운명 뽑기 배경) */
  const stars = [];
  for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random() * 0.75, p: Math.random() * 6.28, s: Math.random() < 0.15 ? 2 : 1 });
  function drawSky(t) {
    const bands = ["#0b0a1a", "#100e26", "#161334", "#1d1842", "#241d4e", "#2c2358"];
    const bh = Math.ceil(VH / bands.length);
    bands.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(0, i * bh, VW, bh + 1); });
    stars.forEach((s) => {
      const a = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0015 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(Math.round(s.x * VW), Math.round(s.y * VH), s.s, s.s);
    });
  }
  function drawHills(baseY) {
    ctx.fillStyle = "#1a1636";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, baseY - 26 - Math.round(Math.sin(x * 0.02) * 14 + Math.sin(x * 0.05) * 6));
    ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fill();
    ctx.fillStyle = "#13102a";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= VW; x += 6) ctx.lineTo(x, baseY - 10 - Math.round(Math.sin(x * 0.035 + 2) * 8));
    ctx.lineTo(VW, VH); ctx.lineTo(0, VH); ctx.fill();
  }

  /* ─────────────────────── 타이틀 ─────────────────────── */
  const Title = {
    parade: [],
    enter() {
      this.parade = [];
      for (let i = 0; i < 7; i++) this.parade.push(this.walker(i * (VW / 6)));
      this.menu();
    },
    walker(x) {
      return { job: F.JOBS[Math.floor(Math.random() * F.JOBS.length)], x: x === undefined ? -40 : x, v: 0.022 + Math.random() * 0.012 };
    },
    menu() {
      closeAll();
      const saved = store.get("save", null);
      const life = F.FAMILY_LIST.filter((f) => !f.combat).reduce((a, f) => a + f.count, 0);
      const html = `
        <div class="title-logo"><span class="logo-sub">직업 3,000종 · 무작위 운명 RPG</span><h1>삼천의 운명</h1></div>
        <div class="opts title-opts">
          <button class="opt" type="button" data-opt="new">새로운 운명${store.get("roll", null) ? ' <small>뽑던 운명 이어서</small>' : G.tokens ? ` <small>재굴림 +${G.tokens}</small>` : ""}</button>
          ${saved ? `<button class="opt" type="button" data-opt="cont">이어하기 <small>${esc(saved.player.name)} · Lv.${saved.player.level}</small></button>` : ""}
          <button class="opt" type="button" data-opt="codex">직업 도감 <small>${fmt(G.codex.size)}/${fmt(F.JOBS.length)}</small></button>
          <button class="opt" type="button" data-opt="hall">명예의 전당 <small>${G.hall.length}명</small></button>
        </div>
        <p class="title-facts">계열 36 · 생활 직업 ${fmt(life)} · 신화 등급 45</p>`;
      openWin(html, {
        cls: "win-title", noBack: true,
        onPick: (v) => {
          if (v === "new") requestNewFate();
          if (v === "cont") continueGame();
          if (v === "codex") openCodex();
          if (v === "hall") openHall();
        }
      });
    },
    update(dt) {
      this.parade.forEach((w, i) => {
        w.x += w.v * dt;
        if (w.x > VW + 40) this.parade[i] = this.walker(-40);
      });
    },
    draw(t) {
      drawSky(t);
      const ground = Math.round(VH * 0.86);
      drawHills(ground);
      for (let x = 0; x < VW; x += TS) ctx.drawImage(Wd.groundTile({ kind: "town" }, "grass" + ((x / TS) % 3), t), x, ground);
      ctx.fillStyle = "rgba(10,8,30,0.45)";
      ctx.fillRect(0, ground, VW, VH - ground);
      this.parade.forEach((w) => {
        const f = Math.floor((t / 140 + w.x) % 4);
        const fr = Dl.frame(w.job, "right", "walk", (f + 4) % 4, 1);
        shadow(w.x, ground + 4, 10, 3);
        drawSprite(fr.cv, w.x - fr.ax, ground + 6 - fr.ay);
      });
    }
  };

  /* ─────────────────────── 운명 뽑기 ─────────────────────── */
  function requestNewFate() {
    const pending = store.get("roll", null);
    if (pending) { startRoll(pending); return; }
    const saved = store.get("save", null);
    if (saved && saved.player) {
      const p = unpackPlayer(saved.player);
      ask(`진행 중인 모험이 있습니다. <b>${esc(p.name)}</b>(${esc(p.job.name)}, Lv.${p.level})을 은퇴시키고 새 운명을 뽑을까요?`, ["은퇴하고 새로 뽑기", "그만두기"], (i) => {
        if (i !== 0) return;
        addHall(p, null);
        store.del("save");
        G.player = null;
        startRoll(null);
      });
      return;
    }
    startRoll(null);
  }

  function startRoll(pending) {
    closeAll();
    if (pending) G.roll = { job: F.jobById(pending.jobId) || E.randomJob(), left: pending.left, name: pending.name || randomName(), rolling: false, t: 0 };
    else {
      G.roll = { job: null, left: 3 + G.tokens, name: randomName(), rolling: false, t: 0 };
      G.tokens = 0;
      store.set("tokens", 0);
    }
    setScene(Roll, !pending);
  }
  const randomName = () => D.HERO_NAMES[Math.floor(Math.random() * D.HERO_NAMES.length)];

  const Roll = {
    shown: null, flick: 0, reveal: 0, circle: null,
    enter(fresh) {
      this.reveal = 0;
      this.circle = null;
      if (fresh || !G.roll.job) this.spin();
      else { this.shown = G.roll.job; this.reveal = 1; this.panel(); }
    },
    spin() {
      const r = G.roll;
      r.job = E.randomJob();
      r.rolling = true;
      discover(r.job);
      store.set("roll", { jobId: r.job.id, left: r.left, name: r.name });
      closeAll();
      $("hud").innerHTML = `<div class="roll-head"><span class="roll-rar">?</span><h2 class="roll-name">운명을 읽는 중…</h2><span class="roll-fam"></span></div>`;
      this.flick = 0;
      this.spinT = reduceMotion ? 0 : 1700;
    },
    finish() {
      const r = G.roll;
      r.rolling = false;
      this.shown = r.job;
      this.reveal = 1;
      const col = S.RARITY_COLOR[r.job.rarity];
      const gx = VW / 2;
      const gy = this.groundY();
      X.holyPillar(gx, gy, r.job.rarity >= 3);
      X.burst(gx, gy - 50, { n: 30 + r.job.rarity * 10, colors: [col, C.white, C.yellow], speed: 3.4, life: 800, up: 0.5 });
      X.ring(gx, gy, col, { r1: 60, life: 700 });
      if (r.job.rarity >= 4) X.flash(col, 300);
      this.panel();
    },
    groundY() {
      return Math.round(Math.min(VH * 0.42, 300));
    },
    head() {
      const j = this.shown;
      const fam = famOf(j);
      $("hud").innerHTML = `<div class="roll-head rar-${j.rarity}"><span class="roll-rar">${rarName(j.rarity)}</span><h2 class="roll-name">${esc(j.name)}</h2>
        <span class="roll-fam">${jobNo(j.id)} · ${esc(fam.name)} 계열${fam.combat ? "" : "(생활)"} · ${D.ELEMENTS[j.el]}</span></div>`;
    },
    panel() {
      const r = G.roll;
      const j = r.job;
      this.head();
      closeAll();
      const html = `
        <div class="roll-panel">
          ${jobCard(j, 1, null)}
          <label class="name-row" for="hero-name"><span>이름</span><input id="hero-name" maxlength="10" value="${esc(r.name)}"><button type="button" class="opt mini" data-opt="dice">무작위</button></label>
          <div class="opts row2">
            <button class="opt primary" type="button" data-opt="ok">이 운명으로 시작</button>
            <button class="opt" type="button" data-opt="re"${r.left <= 0 ? " disabled" : ""}>다시 굴리기 <small>${r.left}회</small></button>
          </div>
        </div>`;
      openWin(html, {
        cls: "win-roll", noBack: false, focus: "ok",
        onBack: () => { store.set("roll", { jobId: r.job.id, left: r.left, name: $("hero-name").value }); closeAll(); setScene(Title); },
        onPick: (v) => {
          if (v === "dice") { $("hero-name").value = randomName(); return; }
          if (v === "re" && r.left > 0) { r.left--; r.name = $("hero-name").value; this.spin(); return; }
          if (v === "ok") this.accept();
        }
      });
    },
    accept() {
      const r = G.roll;
      const name = ($("hero-name").value || "").trim().slice(0, 10) || randomName();
      G.player = E.newPlayer(r.job, name);
      G.roll = null;
      store.del("roll");
      G.place = "town";
      save();
      closeAll();
      fade(() => {
        setScene(Field, { kind: "town" });
        say([`<b>${esc(name)}</b>의 운명은 <b class="rar-t-${G.player.job.rarity}">${esc(G.player.job.name)}</b>.`, "마을 동굴 아래 던전으로 내려가 보자. 길드에서는 직업 도감을, 여관에서는 휴식을, 상점에서는 물약과 장비를 얻을 수 있다."]);
      });
    },
    update(dt) {
      const r = G.roll || {};
      if (r.rolling) {
        this.spinT -= dt;
        this.flick -= dt;
        if (this.flick <= 0) {
          const j = F.JOBS[Math.floor(Math.random() * F.JOBS.length)];
          this.shown = j;
          const el = doc.querySelector(".roll-name");
          if (el) el.textContent = j.name;
          const rar = doc.querySelector(".roll-head");
          if (rar) rar.className = `roll-head rar-${j.rarity} spinning`;
          this.flick = 40 + (1 - Math.max(0, this.spinT) / 1700) * 180;
        }
        if (this.spinT <= 0) this.finish();
      }
      if (!this.circle || this.circle.age > this.circle.life - 50) {
        const j = this.shown;
        this.circle = X.magicCircle(VW / 2, this.groundY(), j ? S.RARITY_COLOR[j.rarity] : C.lblue, 4000);
        this.circle.age = 800;
      }
      if (this.shown && !r.rolling && Math.random() < 0.08 * (1 + this.shown.rarity)) {
        X.add({ x: VW / 2 + (Math.random() - 0.5) * 50, y: this.groundY() - Math.random() * 10, vy: -0.4 - Math.random() * 0.6, life: 900, color: S.RARITY_COLOR[this.shown.rarity], size: 1, glow: 0.7, shape: Math.random() < 0.3 ? "star" : null });
      }
    },
    draw(t) {
      drawSky(t);
      const gy = this.groundY();
      ctx.fillStyle = "#120f28";
      ctx.fillRect(0, gy + 10, VW, VH - gy);
      const tab = Wd.fateTablet(Math.floor(t / 300) % 3);
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.drawImage(tab, Math.round(VW / 2 - tab.width), Math.round(gy - 150), tab.width * 2, tab.height * 2);
      ctx.restore();
      if (this.shown) {
        const anim = G.roll && G.roll.rolling ? "idle" : "idle";
        const fr = Dl.frame(this.shown, "down", anim, Math.floor(t / 500) % 2, 2);
        shadow(VW / 2, gy + 2, 22, 6, 0.5);
        drawSprite(fr.cv, VW / 2 - fr.ax, gy + 6 - fr.ay, G.roll && G.roll.rolling ? 0.75 : 1);
        fr.glow.forEach(([pt, col]) => { ctx.save(); ctx.globalCompositeOperation = "lighter"; X.glowDot(ctx, VW / 2 - fr.ax + pt[0], gy + 6 - fr.ay + pt[1], 10, col, 0.5 + 0.2 * Math.sin(t / 200)); ctx.restore(); });
      }
    }
  };

  /* 직업 카드(운명 뽑기·도감·상태창 공용) */
  function jobCard(job, level, player) {
    const fam = famOf(job);
    const s = E.statsAt(job, level);
    const max = Math.max.apply(null, D.STATS.map((k) => s[k]));
    const ctxP = player || { level, job };
    const stats = D.STATS.map((k) => `<div class="st${k === job.atkStat ? " top" : ""}"><span>${D.STAT_NAMES[k]}</span><i><b style="width:${Math.round((s[k] / max) * 100)}%"></b></i><em>${s[k]}</em></div>`).join("");
    const passives = E.passiveLines(job.passive).map((t) => `<li>${esc(t)}</li>`).join("");
    const TAG = { family: "계열", sig: "대표", mod: "기원", true: "각성", ult: "궁극기" };
    const NODMG = new Set(["heal", "regen", "buff", "rage", "shield", "counter", "summon"]);
    const skills = job.skills.map((sk) => {
      const spec = E.skillSpec(ctxP, sk);
      const cost = sk.type === "sacrifice" ? "HP" : `MP ${spec.cost}`;
      const locked = player && player.level < sk.lv;
      return `<li class="${locked ? "lock" : ""}"><b>${esc(sk.name)}</b><span class="sk-tag">${TAG[sk.tag]} · Lv.${sk.lv} · ${cost}${NODMG.has(sk.type) ? "" : " · " + D.ELEMENTS[sk.el]}</span><p>${E.describeSkill(sk, ctxP)}</p></li>`;
    }).join("");
    return `<div class="card">
      <div class="card-top">
        <div class="card-art"><img src="${portraitURL(fam.id)}" alt="${esc(fam.name)} 계열 초상화" onerror="this.style.visibility='hidden'"><img class="card-doll" src="${thumb(job, "down", 1)}" alt=""></div>
        <ul class="card-lines">
          <li><b>본업</b> ${esc(job.base)} · ${esc(job.desc)}</li>
          <li><b>기원</b> ${job.mod ? `${esc(job.mod)} · ${esc(job.modDesc)}` : "수식어 없는 정통 직업 (능력치 +5%)"}</li>
          <li><b>계열</b> ${esc(fam.name)} · ${esc(fam.desc)}</li>
        </ul>
      </div>
      <h3>능력치 Lv.${level}</h3><div class="stats">${stats}</div>
      <h3>특성</h3><ul class="passives">${passives}</ul>
      <h3>기술</h3><ul class="skills"><li><b>${esc(job.attack.name)}</b><span class="sk-tag">기본 공격 · ${D.ELEMENTS[job.attack.el]}</span><p>위력 100% 공격, MP 조금 회복</p></li>${skills}</ul>
    </div>`;
  }

  /* ─────────────────────── 필드(마을·던전) ─────────────────────── */
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const STEP_MS = 150;

  function makeEnt(tx, ty, extra) {
    return Object.assign({ tx, ty, x: tx * TS, y: ty * TS, fx: tx, fy: ty, dir: "down", moving: false, t: 0, ms: STEP_MS, walkT: 0 }, extra);
  }

  const Field = {
    map: null, hero: null, mons: [], npcs: [], cam: [0, 0], lightCv: null, enc: null, freezeT: 0,
    enter(arg) {
      const p = G.player;
      if (arg.kind === "town") {
        G.place = "town";
        this.map = Wd.makeTown();
        const sp = arg.at || this.map.spawn;
        this.hero = makeEnt(sp.x, sp.y, { dir: arg.dir || "down" });
        this.mons = [];
        this.npcs = [];
        const spots = [[6, 9], [18, 9], [10, 13], [15, 4], [7, 4], [20, 15]];
        spots.forEach(([x, y]) => this.npcs.push(makeEnt(x, y, { job: E.randomJob(), ms: 260, ai: 600 + Math.random() * 1600 })));
      } else {
        G.place = "dungeon";
        E.enterFloor(p, arg.floor);
        this.map = Wd.makeDungeon(arg.floor);
        const sp = this.map.spawn;
        this.hero = makeEnt(sp.x, sp.y, { dir: "down" });
        this.npcs = [];
        this.mons = this.map.monsters.map((m) => makeEnt(m.x, m.y, { mon: m.mon, boss: !!m.boss, ms: m.boss ? 400 : 230, ai: 800 + Math.random() * 1200, wake: 0 }));
        this.reveal();
      }
      this.freezeT = 400;
      this.hud();
      save();
    },
    hud() {
      const p = G.player;
      const d = E.derive(p);
      const where = this.map.kind === "town" ? "마을" : `지하 ${this.map.floor}층${this.map.boss ? " · 보스" : ""}`;
      $("hud").className = "hud-field";
      $("hud").innerHTML = `<div class="hud-plate">
        <div class="hud-l"><b>${esc(p.name)}</b><span class="rar-t-${p.job.rarity}">${esc(p.job.name)}</span><span>Lv.${p.level}</span></div>
        <div class="hud-bars"><i class="hp"><b style="width:${(p.hp / d.maxHp) * 100}%"></b><em>${fmt(p.hp)}/${fmt(d.maxHp)}</em></i><i class="mp"><b style="width:${(p.mp / d.maxMp) * 100}%"></b><em>${fmt(p.mp)}/${fmt(d.maxMp)}</em></i></div>
        <div class="hud-r"><span class="where">${where}</span><span class="gold">${fmt(p.gold)} G</span></div>
      </div><button class="hud-menu" type="button" aria-label="메뉴">☰</button>`;
      $("hud").querySelector(".hud-menu").addEventListener("click", () => { if (!winTop() && !G.busy) openMenu(); });
    },
    reveal() {
      const m = this.map;
      if (m.kind !== "dungeon") return;
      const r = 5;
      for (let y = this.hero.ty - r; y <= this.hero.ty + r; y++) for (let x = this.hero.tx - r; x <= this.hero.tx + r; x++) {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        if ((x - this.hero.tx) ** 2 + (y - this.hero.ty) ** 2 <= r * r + 1) m.seen[y * m.w + x] = 1;
      }
    },
    solidAt(x, y) {
      const m = this.map;
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) return true;
      return m.solid[y * m.w + x];
    },
    entAt(x, y, except) {
      const all = this.mons.concat(this.npcs);
      for (const e of all) if (e !== except && ((e.tx === x && e.ty === y) || (e.moving && e.fx === x && e.fy === y))) return e;
      return null;
    },
    chestAt(x, y) {
      return (this.map.chests || []).find((c) => c.x === x && c.y === y) || null;
    },
    step(ent, dir) {
      const [dx, dy] = DIRS[dir];
      ent.dir = dir;
      ent.fx = ent.tx;
      ent.fy = ent.ty;
      ent.tx += dx;
      ent.ty += dy;
      ent.moving = true;
      ent.t = 0;
    },
    moveEnt(ent, dt, onArrive) {
      if (!ent.moving) return;
      ent.t += dt / ent.ms;
      ent.walkT += dt;
      if (ent.t >= 1) {
        ent.t = 1;
        ent.moving = false;
        ent.x = ent.tx * TS;
        ent.y = ent.ty * TS;
        if (onArrive) onArrive();
        return;
      }
      ent.x = (ent.fx + (ent.tx - ent.fx) * ent.t) * TS;
      ent.y = (ent.fy + (ent.ty - ent.fy) * ent.t) * TS;
    },
    update(dt) {
      const h = this.hero;
      if (this.enc) { this.enc.t += dt; if (this.enc.t >= this.enc.dur) { const e = this.enc; this.enc = null; startBattle(e.mon); } return; }
      this.freezeT = Math.max(0, this.freezeT - dt);
      const paused = winTop() || G.busy;
      this.moveEnt(h, dt, () => this.arrive());
      if (!paused && !h.moving) {
        const dir = heldDir();
        if (dir) this.tryMove(dir);
        else h.walkT = 0;
      }
      if (!paused) {
        this.npcs.forEach((n) => this.npcAI(n, dt));
        if (this.freezeT <= 0) this.mons.forEach((m) => this.monAI(m, dt));
      }
      this.npcs.forEach((n) => this.moveEnt(n, dt));
      this.mons.forEach((m) => this.moveEnt(m, dt));
      const m = this.map;
      if (m.kind === "dungeon" && Math.random() < 0.02 && m.stairs) {
        X.add({ x: m.stairs.x * TS + 16 + (Math.random() - 0.5) * 20, y: m.stairs.y * TS + 22, vy: -0.4, life: 900, color: C.cyan, size: 1, glow: 0.6, shape: "star", world: true });
      }
    },
    tryMove(dir) {
      const h = this.hero;
      const [dx, dy] = DIRS[dir];
      const nx = h.tx + dx;
      const ny = h.ty + dy;
      h.dir = dir;
      const mon = this.mons.find((m) => m.tx === nx && m.ty === ny);
      if (mon) { this.encounter(mon); return; }
      if (this.entAt(nx, ny, null)) return;
      const ch = this.chestAt(nx, ny);
      if (ch) { if (!ch.open) this.openChest(ch); return; }
      if (this.solidAt(nx, ny)) return;
      this.step(h, dir);
    },
    arrive() {
      const h = this.hero;
      const m = this.map;
      this.reveal();
      if (m.kind === "town") {
        const b = m.buildings.find((bd) => bd.door[0] === h.tx && bd.door[1] === h.ty);
        if (b) { held.up = held.down = held.left = held.right = false; enterBuilding(b); }
      } else if (m.stairs && m.stairs.x === h.tx && m.stairs.y === h.ty) {
        held.up = held.down = held.left = held.right = false;
        descend();
      }
    },
    npcAI(n, dt) {
      if (n.moving) return;
      n.ai -= dt;
      if (n.ai > 0) return;
      n.ai = 900 + Math.random() * 2200;
      const dir = ["up", "down", "left", "right"][Math.floor(Math.random() * 4)];
      const [dx, dy] = DIRS[dir];
      const nx = n.tx + dx;
      const ny = n.ty + dy;
      n.dir = dir;
      if (this.solidAt(nx, ny) || this.entAt(nx, ny, n) || (this.hero.tx === nx && this.hero.ty === ny)) return;
      if (this.map.buildings.some((b) => b.door[0] === nx && b.door[1] === ny)) return;
      this.step(n, dir);
    },
    monAI(mon, dt) {
      if (mon.moving || mon.boss) return;
      mon.ai -= dt;
      if (mon.ai > 0) return;
      const h = this.hero;
      const dist = Math.abs(mon.tx - h.tx) + Math.abs(mon.ty - h.ty);
      const chase = dist <= 6;
      mon.ai = chase ? 420 + Math.random() * 260 : 900 + Math.random() * 1400;
      let dirs = ["up", "down", "left", "right"];
      if (chase) {
        dirs.sort((a, b) => {
          const da = Math.abs(mon.tx + DIRS[a][0] - h.tx) + Math.abs(mon.ty + DIRS[a][1] - h.ty);
          const db = Math.abs(mon.tx + DIRS[b][0] - h.tx) + Math.abs(mon.ty + DIRS[b][1] - h.ty);
          return da - db;
        });
        if (!mon.wake) { mon.wake = 1; X.add({ x: mon.x + 16, y: mon.y - 30, vy: -0.3, life: 600, color: C.yellow, shape: "star", glow: 0.8, world: true }); }
      } else dirs = [dirs[Math.floor(Math.random() * 4)]];
      for (const dir of dirs) {
        const [dx, dy] = DIRS[dir];
        const nx = mon.tx + dx;
        const ny = mon.ty + dy;
        if (nx === h.tx && ny === h.ty) { mon.dir = dir; this.encounter(mon); return; }
        if (this.solidAt(nx, ny) || this.entAt(nx, ny, mon) || this.chestAt(nx, ny)) continue;
        if (this.map.stairs && this.map.stairs.x === nx && this.map.stairs.y === ny) continue;
        this.step(mon, dir);
        return;
      }
    },
    encounter(mon) {
      if (this.enc || G.busy) return;
      held.up = held.down = held.left = held.right = false;
      this.enc = { mon, t: 0, dur: reduceMotion ? 50 : 520, snap: null };
      const snap = S.makeCanvas(VW, VH);
      snap.getContext("2d").drawImage(cv, 0, 0);
      this.enc.snap = snap;
    },
    openChest(ch) {
      ch.open = true;
      const p = G.player;
      const fl = this.map.floor;
      X.coins(ch.x * TS + 16, ch.y * TS + 10);
      let msg;
      const r = Math.random();
      if (r < 0.45) { const g = Math.round((20 + fl * 9) * (0.8 + Math.random() * 0.6)); p.gold += g; msg = `상자 안에 <b>${fmt(g)}G</b>가 들어 있었다!`; }
      else if (r < 0.8) { p.potions.hp += 1; msg = "상자에서 <b>회복 물약</b>을 찾았다!"; }
      else { p.potions.mp += 1; msg = "상자에서 <b>마나 물약</b>을 찾았다!"; }
      this.hud();
      save();
      say(msg);
    },
    interact() {
      const h = this.hero;
      const [dx, dy] = DIRS[h.dir];
      const nx = h.tx + dx;
      const ny = h.ty + dy;
      const npc = this.npcs.find((n) => n.tx === nx && n.ty === ny);
      if (npc) { npcTalk(npc); return; }
      const ch = this.chestAt(nx, ny);
      if (ch && !ch.open) { this.openChest(ch); return; }
      const m = this.map;
      if (m.kind === "town" && m.tablet.x === nx && m.tablet.y === ny) { tabletTalk(); return; }
      if (m.kind === "town") {
        const b = m.buildings.find((bd) => bd.door[0] === nx && bd.door[1] === ny);
        if (b) enterBuilding(b);
      }
    },
    key(k) {
      if (this.enc || G.busy) return;
      if (k === "a") this.interact();
      if (k === "b") openMenu();
    },
    camera() {
      const m = this.map;
      const h = this.hero;
      const mw = m.w * TS;
      const mh = m.h * TS;
      let cx = h.x + 16 - VW / 2;
      let cy = h.y + 16 - VH / 2 - 10;
      cx = mw <= VW ? (mw - VW) / 2 : Math.max(0, Math.min(mw - VW, cx));
      cy = mh <= VH ? (mh - VH) / 2 : Math.max(-40, Math.min(mh - VH, cy));
      this.cam = [Math.round(cx), Math.round(cy)];
    },
    draw(t) {
      const m = this.map;
      this.camera();
      const [cx, cy] = this.cam;
      ctx.fillStyle = m.kind === "town" ? "#0e1a10" : "#05030a";
      ctx.fillRect(0, 0, VW, VH);
      const x0 = Math.max(0, Math.floor(cx / TS));
      const y0 = Math.max(0, Math.floor(cy / TS));
      const x1 = Math.min(m.w - 1, Math.floor((cx + VW) / TS));
      const y1 = Math.min(m.h - 1, Math.floor((cy + VH) / TS));
      const dark = m.kind === "dungeon";
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (dark && !m.seen[y * m.w + x]) continue;
        ctx.drawImage(Wd.groundTile(m, m.ground[y * m.w + x], t / 1000), x * TS - cx, y * TS - cy);
      }
      if (m.stairs && (!dark || m.seen[m.stairs.y * m.w + m.stairs.x])) ctx.drawImage(Wd.stairs(m.tier), m.stairs.x * TS - cx, m.stairs.y * TS - cy);
      // 세로 순서로 물체 정렬
      const objs = [];
      if (m.kind === "town") {
        m.props.forEach((p) => {
          if (p.kind === "tree") objs.push({ y: p.y * TS + 30, img: Wd.tree(p.v), x: p.x * TS + 16, foot: p.y * TS + 32 });
          if (p.kind === "bush") objs.push({ y: p.y * TS + 20, img: Wd.bush(), x: p.x * TS + 16, foot: p.y * TS + 28 });
          if (p.kind === "lamp") objs.push({ y: p.y * TS + 28, img: Wd.lamp(), x: p.x * TS + 16, foot: p.y * TS + 30 });
        });
        m.buildings.forEach((b) => objs.push({ y: (b.y + b.h) * TS - 4, img: Wd.building(b.type), x: (b.x + b.w / 2) * TS, foot: (b.y + b.h) * TS }));
        objs.push({ y: m.tablet.y * TS + 28, img: Wd.fateTablet(Math.floor(t / 300) % 3), x: m.tablet.x * TS + 16, foot: m.tablet.y * TS + 32 });
      } else {
        m.props.forEach((p) => {
          if (!m.seen[p.y * m.w + p.x]) return;
          const img = p.kind === "barrel" ? Wd.barrel() : p.kind === "bones" ? Wd.bones() : Wd.rock(m.tier);
          objs.push({ y: p.y * TS + 16, img, x: p.x * TS + 16, foot: p.y * TS + 28 });
        });
        (m.chests || []).forEach((c) => { if (m.seen[c.y * m.w + c.x]) objs.push({ y: c.y * TS + 20, img: Wd.chest(c.open), x: c.x * TS + 16, foot: c.y * TS + 28 }); });
        m.torches.forEach((tc) => { if (m.seen[tc.y * m.w + tc.x]) objs.push({ y: tc.y * TS + 31, img: Wd.torch(Math.floor(t / 160 + tc.x) % 2), x: tc.x * TS + 16, foot: tc.y * TS + 28 }); });
      }
      const heroFrame = this.entFrame(this.hero, G.player.job, t);
      objs.push({ y: this.hero.y + 30, ent: this.hero, fr: heroFrame, hero: true });
      this.npcs.forEach((n) => objs.push({ y: n.y + 30, ent: n, fr: this.entFrame(n, n.job, t) }));
      this.mons.forEach((mo) => {
        if (dark && !m.seen[mo.ty * m.w + mo.tx]) return;
        objs.push({ y: mo.y + 30, ent: mo, mon: true });
      });
      objs.sort((a, b) => a.y - b.y);
      objs.forEach((o) => {
        if (o.img) { drawSprite(o.img, o.x - o.img.width / 2 - cx, o.foot - o.img.height - cy); return; }
        const e = o.ent;
        if (o.mon) {
          const img = S.monsterBig(e.mon.name, e.boss ? 3 : 2);
          const bob = Math.round(Math.sin(t / 260 + e.tx) * 1.2);
          shadow(e.x + 16 - cx, e.y + 29 - cy, e.boss ? 22 : 14, 4);
          drawSprite(img, e.x + 16 - img.width / 2 - cx, e.y + 31 - img.height + bob - cy);
          if (e.boss) { ctx.save(); ctx.globalCompositeOperation = "lighter"; X.glowDot(ctx, e.x + 16 - cx, e.y - 10 - cy, 40, C.red, 0.2 + 0.1 * Math.sin(t / 200)); ctx.restore(); }
          return;
        }
        shadow(e.x + 16 - cx, e.y + 29 - cy, 10, 3);
        drawSprite(o.fr.cv, e.x + 16 - o.fr.ax - cx, e.y + 33 - o.fr.ay - cy);
      });
      this.lighting(t);
      ctx.save();
      ctx.translate(-cx, -cy);
      X.draw(ctx);
      ctx.restore();
      if (this.enc) this.drawEncounter();
    },
    entFrame(e, job, t) {
      if (e.moving || e.walkT > 0) {
        const f = Math.floor(e.walkT / 110) % 4;
        return Dl.frame(job, e.dir, "walk", f, 1);
      }
      return Dl.frame(job, e.dir, "idle", Math.floor(t / 500) % 2, 1);
    },
    lighting(t) {
      const m = this.map;
      const [cx, cy] = this.cam;
      if (!this.lightCv || this.lightCv.width !== VW || this.lightCv.height !== VH) this.lightCv = S.makeCanvas(VW, VH);
      const lc = this.lightCv.getContext("2d");
      lc.globalCompositeOperation = "source-over";
      lc.clearRect(0, 0, VW, VH);
      lc.fillStyle = m.kind === "town" ? "rgba(14,12,46,0.5)" : "rgba(3,2,10,0.86)";
      lc.fillRect(0, 0, VW, VH);
      lc.globalCompositeOperation = "destination-out";
      const hole = (x, y, r, a) => {
        const g = lc.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(0,0,0,${a})`);
        g.addColorStop(0.55, `rgba(0,0,0,${a * 0.8})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        lc.fillStyle = g;
        lc.fillRect(x - r, y - r, r * 2, r * 2);
      };
      const lights = [];
      const hx = this.hero.x + 16 - cx;
      const hy = this.hero.y + 14 - cy;
      hole(hx, hy, m.kind === "town" ? 120 : 130, 1);
      if (m.kind === "town") {
        m.buildings.forEach((b) => {
          if (b.type === "cave") { lights.push([(b.x + 1.25) * TS - cx, (b.y + 2) * TS - cy, 40, C.orange]); lights.push([(b.x + 2.75) * TS - cx, (b.y + 2) * TS - cy, 40, C.orange]); return; }
          [[0.8, 2.0], [3.2, 2.0], [0.8, 2.8], [3.2, 2.8]].forEach(([ox, oy]) => lights.push([(b.x + ox) * TS - cx, (b.y + oy) * TS - cy, 34, C.yellow]));
        });
        m.props.forEach((p) => { if (p.kind === "lamp") lights.push([p.x * TS + 16 - cx, p.y * TS - 6 - cy, 70, C.yellow]); });
        lights.push([m.tablet.x * TS + 16 - cx, m.tablet.y * TS - 6 - cy, 70, C.cyan]);
      } else {
        m.torches.forEach((tc) => { if (m.seen[tc.y * m.w + tc.x]) lights.push([tc.x * TS + 16 - cx, tc.y * TS + 12 - cy, 72 + Math.sin(t / 120 + tc.x) * 4, C.orange]); });
        if (m.stairs && m.seen[m.stairs.y * m.w + m.stairs.x]) lights.push([m.stairs.x * TS + 16 - cx, m.stairs.y * TS + 16 - cy, 40, C.cyan]);
        this.mons.forEach((mo) => { if (mo.boss) lights.push([mo.x + 16 - cx, mo.y - cy, 90, C.red]); });
      }
      lights.forEach(([x, y, r]) => hole(x, y, r, 0.85));
      ctx.drawImage(this.lightCv, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      lights.forEach(([x, y, r, col]) => X.glowDot(ctx, x, y, r * 0.55, col, 0.16));
      ctx.restore();
    },
    drawEncounter() {
      const e = this.enc;
      const t = Math.min(1, e.t / e.dur);
      const px = Math.max(1, Math.round(1 + t * 18));
      const small = S.makeCanvas(Math.ceil(VW / px), Math.ceil(VH / px));
      const sctx = small.getContext("2d");
      sctx.drawImage(e.snap, 0, 0, small.width, small.height);
      ctx.drawImage(small, 0, 0, small.width * px, small.height * px);
      ctx.fillStyle = `rgba(255,255,255,${t < 0.15 ? t * 4 : Math.max(0, 0.6 - t)})`;
      ctx.fillRect(0, 0, VW, VH);
      ctx.fillStyle = `rgba(5,3,12,${Math.max(0, (t - 0.5) * 2)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
  };

  function npcTalk(npc) {
    const j = npc.job;
    discover(j);
    const h = Field.hero;
    npc.dir = h.dir === "up" ? "down" : h.dir === "down" ? "up" : h.dir === "left" ? "right" : "left";
    const lines = [
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b> (${rarName(j.rarity)})<br>"나는 ${esc(j.desc)}(이)야. ${J(G.player.job.name, "이/가")} 됐다니, 너도 운명을 받았구나."`,
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"내 기술은 <b>${esc(j.skills[1].name)}</b>! ${E.describeSkill(j.skills[1], { level: 1, job: j })}."`,
      `<b class="rar-t-${j.rarity}">${esc(j.name)}</b><br>"던전은 10층마다 보스가 지키고 있대. 물약은 넉넉히 챙겨."`
    ];
    say(lines[Math.floor(Math.random() * lines.length)] + `<br><small>(직업 도감에 기록됨)</small>`);
  }

  function tabletTalk() {
    const p = G.player;
    say([`운명의 석판이 빛난다…<br>"<b>${esc(p.name)}</b>, 그대의 운명은 <b class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</b>."`, `지금까지 만난 직업 <b>${fmt(G.codex.size)}</b> / 3,000. 최고 기록 지하 <b>${p.best}</b>층.`]);
  }

  function enterBuilding(b) {
    const p = G.player;
    const h = Field.hero;
    const stepBack = () => { if (h.tx === b.door[0] && h.ty === b.door[1]) { Field.step(h, "down"); h.dir = "up"; } };
    if (b.type === "inn") {
      const price = E.prices(p).inn;
      ask(`<b>여관</b> "어서 오세요! ${price ? `하룻밤에 <b>${fmt(price)}G</b>입니다.` : "단골손님은 공짜예요!"}"`, ["묵는다", "그만둔다"], (i) => {
        stepBack();
        if (i !== 0) return;
        const res = E.rest(p);
        if (!res.ok) { say(res.msg); return; }
        fade(() => { Field.hud(); save(); say(res.msg); X.heal(Field.hero.x + 16, Field.hero.y + 10, C.green); });
      });
      return;
    }
    if (b.type === "shop") { openShop(() => stepBack()); return; }
    if (b.type === "guild") {
      const w = openWin(`<h2 class="win-h">모험가 길드</h2><div class="opts">
        <button class="opt" type="button" data-opt="codex">직업 도감 <small>${fmt(G.codex.size)}/3,000</small></button>
        <button class="opt" type="button" data-opt="hall">명예의 전당</button>
        <button class="opt" type="button" data-opt="close">나가기</button></div>`, {
        onPick: (v) => { if (v === "close") closeWin(w); if (v === "codex") openCodex(); if (v === "hall") openHall(); },
        onClose: stepBack
      });
      return;
    }
    if (b.type === "cave") {
      ask(`던전 입구다. <b>지하 ${p.floor}층</b>부터 탐험할까?<br><small>최고 기록 ${p.best}층 · 10층마다 보스</small>`, ["들어간다", "그만둔다"], (i) => {
        if (i !== 0) { stepBack(); return; }
        fade(() => {
          setScene(Field, { kind: "dungeon", floor: Math.max(1, p.floor) });
          banner(`지하 ${p.floor}층`);
        });
      });
    }
  }

  function descend() {
    const p = G.player;
    G.busy++;
    fade(() => {
      G.busy = Math.max(0, G.busy - 1);
      setScene(Field, { kind: "dungeon", floor: p.floor + 1 });
      banner(`지하 ${p.floor}층${p.floor % 10 === 0 ? " · 보스" : ""}`);
    });
  }

  function banner(text) {
    const el = doc.createElement("div");
    el.className = "banner";
    el.textContent = text;
    $("screen").appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* ─────────────────────── 메뉴·상점·상태 ─────────────────────── */
  function openMenu() {
    const p = G.player;
    const inDungeon = G.place === "dungeon";
    const w = openWin(`<h2 class="win-h">메뉴</h2><div class="opts">
      <button class="opt" type="button" data-opt="status">상태</button>
      <button class="opt" type="button" data-opt="items">도구 <small>HP ${p.potions.hp} · MP ${p.potions.mp}</small></button>
      <button class="opt" type="button" data-opt="codex">직업 도감</button>
      ${inDungeon ? '<button class="opt" type="button" data-opt="town">마을로 귀환</button>' : ""}
      <button class="opt" type="button" data-opt="title">저장하고 타이틀로</button>
      <button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-menu",
      onPick: (v) => {
        if (v === "close") closeWin(w);
        if (v === "status") openStatus();
        if (v === "items") openItems();
        if (v === "codex") openCodex();
        if (v === "town") {
          ask("마을로 돌아갈까? 다음에는 지하 " + p.floor + "층부터 다시 시작한다.", ["돌아간다", "그만둔다"], (i) => {
            if (i !== 0) return;
            closeAll();
            fade(() => setScene(Field, { kind: "town", at: { x: 17, y: 17 }, dir: "down" }));
          });
        }
        if (v === "title") { save(); closeAll(); fade(() => setScene(Title)); }
      }
    });
  }

  function openStatus() {
    const p = G.player;
    const d = E.derive(p);
    const cells = [["HP", `${fmt(p.hp)}/${fmt(d.maxHp)}`], ["MP", `${fmt(p.mp)}/${fmt(d.maxMp)}`], ["공격력", fmt(E.power(p, d, p.job.atkStat))], ["방어력", fmt(d.def)],
      ["치명타", `${Math.round(d.crit * 100)}%`], ["회피", `${Math.round(d.eva * 100)}%`], ["무기", `+${p.weaponLv}`], ["방어구", `+${p.armorLv}`],
      ["경험치", `${fmt(p.exp)}/${fmt(E.expNeed(p.level))}`], ["골드", fmt(p.gold)], ["최고 층", p.best], ["처치", fmt(p.kills)]];
    openWin(`<h2 class="win-h">${esc(p.name)} <small>Lv.${p.level} · <span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span></small></h2>
      <div class="scroll"><dl class="sheet">${cells.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>${jobCard(p.job, p.level, p)}</div>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  function openItems() {
    const p = G.player;
    const pot = 1 + (p.job.passive.pot || 0);
    const w = openWin(`<h2 class="win-h">도구</h2><div class="opts">
      <button class="opt" type="button" data-opt="hp"${p.potions.hp ? "" : " disabled"}><img src="${S.icon("potion", 2)}" alt="">회복 물약 <small>${p.potions.hp}개 · HP ${Math.round(40 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="mp"${p.potions.mp ? "" : " disabled"}><img src="${S.icon("ether", 2)}" alt="">마나 물약 <small>${p.potions.mp}개 · MP ${Math.round(50 * pot)}%</small></button>
      <button class="opt" type="button" data-opt="close">닫기</button></div><p class="win-msg" role="status"></p>`, {
      onPick: (v) => {
        if (v === "close") { closeWin(w); return; }
        const res = E.drink(p, v);
        Field.hud();
        save();
        closeWin(w);
        openItems();
        winTop().el.querySelector(".win-msg").textContent = res.msg;
      }
    });
  }

  function openShop(onDone) {
    const p = G.player;
    const pr = E.prices(p);
    const pot = 1 + (p.job.passive.pot || 0);
    const row = (key, icon, name, note) => `<button class="opt shop-row" type="button" data-opt="${key}"${p.gold >= pr[key] ? "" : " disabled"}><img src="${S.icon(icon, 2)}" alt=""><span><b>${name}</b><small>${note}</small></span><em>${fmt(pr[key])}G</em></button>`;
    const w = openWin(`<h2 class="win-h">상점 <small>보유 ${fmt(p.gold)}G${p.job.passive.disc ? ` · 할인 ${Math.round(Math.min(0.5, p.job.passive.disc) * 100)}%` : ""}</small></h2>
      <div class="opts scroll">
        ${row("hp", "potion", "회복 물약", `HP ${Math.round(40 * pot)}% 회복 · 보유 ${p.potions.hp}`)}
        ${row("mp", "ether", "마나 물약", `MP ${Math.round(50 * pot)}% 회복 · 보유 ${p.potions.mp}`)}
        ${row("weapon", "sword", `무기 강화 +${p.weaponLv}→+${p.weaponLv + 1}`, "공격력 +6%, 추가 피해 +3")}
        ${row("armor", "shield", `방어구 강화 +${p.armorLv}→+${p.armorLv + 1}`, "최대 HP +4%, 방어력 +3")}
        ${row("scroll", "scroll", "전직의 두루마리", "레벨·장비는 그대로, 직업만 3,000개 중 무작위로")}
        <button class="opt" type="button" data-opt="close">나가기</button>
      </div><p class="win-msg" role="status"></p>`, {
      cls: "win-shop",
      onClose: onDone,
      onPick: (v) => {
        if (v === "close") { closeWin(w); return; }
        if (v === "scroll") {
          ask(`<b>${esc(p.job.name)}</b>의 운명을 버리고 새 직업을 무작위로 받을까? 되돌릴 수 없다.`, ["두루마리를 읽는다", "그만둔다"], (i) => {
            if (i !== 0) return;
            const res = E.buy(p, "scroll");
            if (!res.ok) { say(res.msg); return; }
            discover(res.job);
            save();
            Field.hud();
            closeAll();
            X.holyPillar(VW / 2, VH / 2 + 10, true);
            say([`두루마리가 빛나며 운명이 다시 쓰였다!`, `새 직업: <b class="rar-t-${res.job.rarity}">${rarName(res.job.rarity)} ${esc(res.job.name)}</b>`], () => { if (onDone) onDone(); });
          });
          return;
        }
        const res = E.buy(p, v);
        save();
        Field.hud();
        const keep = w.idx;
        w.o.onClose = null;
        closeWin(w);
        openShop(onDone);
        const nw = winTop();
        nw.idx = keep;
        focusOpt(nw);
        const msg = nw.el.querySelector(".win-msg");
        msg.textContent = res.msg;
        msg.classList.toggle("bad", !res.ok);
      }
    });
  }

  /* ─────────────────────── 도감·명예의 전당 ─────────────────────── */
  function openCodex() {
    let limit = 60;
    const w = openWin(`<h2 class="win-h">직업 도감 <small>만난 직업 ${fmt(G.codex.size)} / 3,000</small></h2>
      <div class="cx-filters">
        <input id="cx-q" type="search" placeholder="직업·기술 이름" aria-label="직업 검색">
        <select id="cx-fam" aria-label="계열"><option value="all">모든 계열</option><option value="combat">전투 계열</option><option value="life">생활 계열</option>
          ${F.FAMILY_LIST.map((f) => `<option value="${f.idx}">${esc(f.name)} · ${f.count}</option>`).join("")}</select>
        <select id="cx-rar" aria-label="등급"><option value="all">모든 등급</option>${D.RARITIES.map((r, i) => `<option value="${i}">${r.name} · ${r.count}</option>`).join("")}</select>
        <label class="cx-found"><input type="checkbox" id="cx-found"> 만난 직업만</label>
      </div>
      <p class="cx-count" id="cx-count"></p>
      <div class="opts scroll cx-list" id="cx-list"></div>
      <div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full",
      onPick: (v, b) => {
        if (v === "close") { closeWin(w); return; }
        if (v === "more") { limit += 90; render(); return; }
        if (v.startsWith("job")) openJob(F.jobById(Number(v.slice(3))));
      }
    });
    const render = () => {
      const q = $("cx-q").value.trim();
      const fam = $("cx-fam").value;
      const rar = $("cx-rar").value;
      const found = $("cx-found").checked;
      const list = F.JOBS.filter((j) => {
        const f = famOf(j);
        if (fam === "combat" && !f.combat) return false;
        if (fam === "life" && f.combat) return false;
        if (!["all", "combat", "life"].includes(fam) && String(j.fam) !== fam) return false;
        if (rar !== "all" && String(j.rarity) !== rar) return false;
        if (found && !G.codex.has(j.id)) return false;
        if (q && !j.name.includes(q) && !j.skills.some((s) => s.name.includes(q))) return false;
        return true;
      });
      $("cx-count").textContent = `${fmt(list.length)}개 직업`;
      $("cx-list").innerHTML = list.slice(0, limit).map((j) => `<button class="opt cx-row${G.codex.has(j.id) ? "" : " unseen"}" type="button" data-opt="job${j.id}">
        <img src="${thumb(j, "down", 1)}" alt=""><span><b class="rar-t-${j.rarity}">${esc(j.name)}</b><small>${jobNo(j.id)} · ${esc(famOf(j).name)} · ${rarName(j.rarity)}</small></span>${G.codex.has(j.id) ? "<em>만남</em>" : ""}</button>`).join("")
        + (list.length > limit ? `<button class="opt" type="button" data-opt="more">더 보기 (${fmt(list.length - limit)}개 남음)</button>` : "");
      w.idx = 0;
    };
    let timer = null;
    $("cx-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => { limit = 60; render(); }, 160); });
    ["cx-fam", "cx-rar", "cx-found"].forEach((id) => $(id).addEventListener("change", () => { limit = 60; render(); }));
    render();
  }

  function openJob(job) {
    openWin(`<h2 class="win-h"><span class="rar-t-${job.rarity}">${esc(job.name)}</span> <small>${jobNo(job.id)} · ${rarName(job.rarity)}${G.codex.has(job.id) ? " · 만남" : ""}</small></h2>
      <div class="scroll">${jobCard(job, 1, null)}</div><div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  function addHall(p, cause) {
    G.hall.push({ name: p.name, job: p.job.name, jobId: p.job.id, rarity: p.job.rarity, fam: p.job.fam, level: p.level, best: p.best, kills: p.kills, cause, date: Date.now() });
    G.hall.sort((a, b) => b.best - a.best || b.level - a.level || a.date - b.date);
    G.hall = G.hall.slice(0, 50);
    store.set("hall", G.hall);
  }

  function openHall() {
    const rows = G.hall.length ? G.hall.map((h, i) => {
      const job = F.jobById(h.jobId);
      return `<div class="hall-row"><span class="hall-rank">${i + 1}</span>${job ? `<img src="${thumb(job, "down", 1)}" alt="">` : ""}<span><b>${esc(h.name)}</b><small><span class="rar-t-${h.rarity}">${rarName(h.rarity)} ${esc(h.job)}</span> · Lv.${h.level} · ${h.cause ? esc(J(h.cause, "에게")) + " 패배" : "은퇴"}</small></span><em>B${h.best}</em></div>`;
    }).join("") : `<p class="empty">아직 기록이 없습니다. 첫 운명을 뽑아 던전에 들어가 보세요.</p>`;
    openWin(`<h2 class="win-h">명예의 전당</h2><div class="scroll hall">${rows}</div><div class="opts"><button class="opt" type="button" data-opt="close">닫기</button></div>`, {
      cls: "win-full", onPick: (v, b, w) => { if (v === "close") closeWin(w); }
    });
  }

  /* ─────────────────────── 전투 ─────────────────────── */
  function startBattle(monEnt) {
    const p = G.player;
    save({ pending: { name: monEnt.mon.name, floor: p.floor } });
    setScene(Battle, { ent: monEnt });
  }

  const RANGED = new Set(["bow", "crossbow", "gun", "rifle", "cannon", "bomb", "cards", "dice", "shuriken", "boomerang"]);
  const CASTER = new Set(["staff", "wand", "holystaff", "skullstaff", "starstaff", "leafstaff", "totem", "orb", "book", "flask", "potion", "lantern", "lute", "drum", "horn", "fan", "quill", "brush", "medkit", "coinbag"]);

  const Battle = {
    fxScale: 2,
    enter(arg) {
      const p = G.player;
      this.ent = arg.ent;
      this.b = E.startBattle(p, { floor: p.floor, monster: arg.ent.mon });
      this.hero = { ox: 0, oy: 0, anim: "idle", f: 0, flash: 0, shake: 0, ko: 0, alpha: 1 };
      this.foe = { ox: 0, oy: 0, flash: 0, shake: 0, alpha: 1, dead: false };
      this.mode = "intro";
      this.tier = Math.min(4, Math.floor((p.floor - 1) / 10));
      this.layout();
      this.ui();
      this.msg(this.b.log.map((l) => esc(l.text)));
      this.foe.ox = -VW * 0.6;
      this.hero.ox = VW * 0.5;
      tween(this.foe, { ox: 0 }, 420).then(() => { this.mode = "cmd"; this.commands(); });
      tween(this.hero, { ox: 0 }, 420);
    },
    layout() {
      /* 창 내용(이름표·메시지·명령 2줄)은 CSS 픽셀 기준이라 배율로 나눈다 */
      this.cmdH = Math.ceil(232 / SCALE);
      this.sceneH = VH - this.cmdH;
      this.groundY = Math.round(this.sceneH * 0.84);
      this.foeX = Math.round(VW * 0.3);
      this.heroX = Math.round(VW * 0.74);
      const big = this.b.enemy.boss ? 4 : 3;
      this.foeImg = S.monsterBig(this.b.enemy.base || this.b.enemy.name, big);
      this.foeImgName = S.monsterBig(this.b.enemy.name, big);
    },
    ui() {
      $("hud").className = "hud-battle";
      $("hud").innerHTML = `<div class="foe-plate"><b id="bf-name"></b><span id="bf-lv"></span><i class="hp"><b id="bf-hp"></b></i><div class="chips" id="bf-st"></div></div>`;
      closeAll();
      this.win = openWin(`<div class="bwin" style="height:${this.cmdH * SCALE}px">
        <div class="bme"><b id="bm-name"></b><span id="bm-job"></span><i class="hp"><b id="bm-hp"></b><em id="bm-hpt"></em></i><i class="mp"><b id="bm-mp"></b><em id="bm-mpt"></em></i><div class="chips" id="bm-st"></div></div>
        <div class="bmsg" id="bmsg"></div>
        <div class="bcmd" id="bcmd"></div>
      </div>`, { cls: "win-battle", noBack: true, cols: 3, onPick: (v) => this.pick(v), onBack: () => this.back(), onFocus: (v) => this.focusInfo(v) });
      this.plates();
    },
    plates() {
      const p = G.player;
      const d = E.derive(p);
      const e = this.b.enemy;
      $("bf-name").textContent = e.name;
      $("bf-lv").textContent = `Lv.${e.lv}${e.boss ? " · 보스" : ""}`;
      $("bf-hp").style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      const est = [];
      ["burn", "poison", "bleed", "curse"].forEach((k) => { if (e.st[k]) est.push({ burn: "화상", poison: "중독", bleed: "출혈", curse: "저주" }[k]); });
      if (e.st.stun) est.push("기절");
      if (e.st.charm) est.push("혼란");
      if (e.st.debuff) est.push("약화");
      if (e.enraged) est.push("분노");
      const weak = this.b.weakKnown && e.weak ? `<span class="chip weak">약점 ${D.ELEMENTS[e.weak]}</span>` : "";
      $("bf-st").innerHTML = weak + est.map((s) => `<span class="chip">${s}</span>`).join("");
      $("bm-name").textContent = p.name;
      $("bm-job").innerHTML = `<span class="rar-t-${p.job.rarity}">${esc(p.job.name)}</span> · Lv.${p.level}`;
      $("bm-hp").style.width = `${Math.max(0, (p.hp / d.maxHp) * 100)}%`;
      $("bm-mp").style.width = `${Math.max(0, (p.mp / d.maxMp) * 100)}%`;
      $("bm-hpt").textContent = `${fmt(Math.max(0, p.hp))}/${fmt(d.maxHp)}`;
      $("bm-mpt").textContent = `${fmt(p.mp)}/${fmt(d.maxMp)}`;
      const ps = this.b.ps;
      const pst = [];
      if (ps.barrier > 0) pst.push(`보호막 ${fmt(ps.barrier)}`);
      if (ps.atkUp) pst.push("공격↑");
      if (ps.rage) pst.push("광폭");
      if (ps.counter) pst.push("반격");
      if (ps.evade) pst.push("회피↑");
      if (ps.regen) pst.push("재생");
      if (ps.summon) pst.push("소환수");
      if (ps.burn) pst.push("화상");
      if (ps.poison) pst.push("중독");
      if (ps.weaken) pst.push("쇠약");
      $("bm-st").innerHTML = pst.map((s) => `<span class="chip">${s}</span>`).join("");
    },
    msg(lines) {
      const el = $("bmsg");
      if (!el) return;
      this.lastMsg = lines.slice(-3).map((l) => `<p>${l}</p>`).join("");
      el.innerHTML = this.lastMsg;
    },
    commands() {
      const p = G.player;
      this.sub = null;
      if (this.lastMsg !== undefined && $("bmsg")) $("bmsg").innerHTML = this.lastMsg;
      const box = $("bcmd");
      box.className = "bcmd";
      box.innerHTML = `
        <button class="opt" type="button" data-opt="attack">${esc(p.job.attack.name)}<small>기본 공격</small></button>
        <button class="opt" type="button" data-opt="skills">기술<small>${p.job.skills.filter((s) => s.lv <= p.level).length}개</small></button>
        <button class="opt" type="button" data-opt="guard">방어<small>피해↓ MP↑</small></button>
        <button class="opt" type="button" data-opt="items"${p.potions.hp + p.potions.mp ? "" : " disabled"}>도구<small>HP ${p.potions.hp} · MP ${p.potions.mp}</small></button>
        <button class="opt" type="button" data-opt="flee"${this.b.enemy.boss ? " disabled" : ""}>도망<small>${this.b.enemy.boss ? "보스전" : Math.round(E.fleeChance(p, this.b) * 100) + "%"}</small></button>
        <button class="opt" type="button" data-opt="info">정보<small>기술 설명</small></button>`;
      this.win.o.cols = 3;
      this.win.idx = 0;
      focusOpt(this.win);
    },
    skillList() {
      const p = G.player;
      this.sub = "skills";
      const box = $("bcmd");
      box.className = "bcmd";
      box.innerHTML = p.job.skills.map((sk, i) => {
        const av = E.skillAvailable(p, this.b, i);
        const sub = av.ok ? (av.hpCost ? "HP 소모" : `MP ${av.cost}`) : av.why;
        return `<button class="opt sk${sk.tag === "ult" ? " ult" : ""}" type="button" data-opt="sk${i}"${av.ok ? "" : " disabled"}>${esc(sk.name)}<small>${sub}</small></button>`;
      }).join("") + `<button class="opt" type="button" data-opt="back">돌아가기<small>명령으로</small></button>`;
      this.win.o.cols = 3;
      this.win.idx = 0;
      focusOpt(this.win);
    },
    itemList() {
      const p = G.player;
      this.sub = "items";
      const pot = 1 + (p.job.passive.pot || 0);
      const box = $("bcmd");
      box.className = "bcmd list";
      box.innerHTML = `<button class="opt" type="button" data-opt="ihp"${p.potions.hp ? "" : " disabled"}><img src="${S.icon("potion", 2)}" alt="">회복 물약<small>${p.potions.hp}개 · ${Math.round(40 * pot)}%</small></button>
        <button class="opt" type="button" data-opt="imp"${p.potions.mp ? "" : " disabled"}><img src="${S.icon("ether", 2)}" alt="">마나 물약<small>${p.potions.mp}개 · ${Math.round(50 * pot)}%</small></button>
        <button class="opt" type="button" data-opt="back">돌아가기</button>`;
      this.win.o.cols = 1;
      this.win.idx = 0;
      focusOpt(this.win);
    },
    focusInfo(v) {
      const el = $("bmsg");
      if (!el || this.sub !== "skills" || !v) return;
      if (!v.startsWith("sk")) { el.innerHTML = this.lastMsg || ""; return; }
      const sk = G.player.job.skills[Number(v.slice(2))];
      el.innerHTML = `<p class="sk-desc"><b>${esc(sk.name)}</b> ${esc(E.describeSkill(sk, G.player))}</p>`;
    },
    back() {
      if (this.mode !== "cmd") return;
      if (this.sub) this.commands();
    },
    pick(v) {
      if (this.mode !== "cmd") return;
      if (v === "skills") { this.skillList(); return; }
      if (v === "items") { this.itemList(); return; }
      if (v === "back") { this.commands(); return; }
      if (v === "info") { openStatus(); return; }
      let action = null;
      if (v === "attack") action = { kind: "attack" };
      if (v === "guard") action = { kind: "guard" };
      if (v === "flee") action = { kind: "flee" };
      if (v === "ihp") action = { kind: "potion", item: "hp" };
      if (v === "imp") action = { kind: "potion", item: "mp" };
      if (v.startsWith("sk")) action = { kind: "skill", idx: Number(v.slice(2)) };
      if (action) this.run(action);
    },
    async run(action) {
      const b = this.b;
      const p = G.player;
      const before = b.logCount;
      E.act(p, b, action);
      const n = b.logCount - before;
      const logs = b.log.slice(-n);
      const fxs = b.fx.slice();
      this.mode = "anim";
      $("bcmd").innerHTML = "";
      await this.animate(logs, fxs);
      G.fast = false;
      this.plates();
      if (b.result === "win") return this.victory();
      if (b.result === "lose") return this.defeat();
      if (b.result === "fled") return this.fled();
      save({ pending: { name: this.ent.mon.name, floor: p.floor } });
      this.mode = "cmd";
      this.commands();
    },
    async animate(logs, fxs) {
      const phases = Array.from(new Set(logs.map((l) => l.ph).concat(fxs.map((f) => f.ph)))).sort((a, b) => a - b);
      const shown = [];
      for (const ph of phases) {
        const L = logs.filter((l) => l.ph === ph);
        L.forEach((l) => shown.push(esc(l.text)));
        if (L.length) this.msg(shown);
        const list = fxs.filter((f) => f.ph === ph);
        let i = 0;
        while (i < list.length) {
          const f = list[i];
          if (f.kind === "act") {
            const hits = [];
            let j = i + 1;
            while (j < list.length && list[j].kind !== "act") { hits.push(list[j]); j++; }
            if (f.target === "player") await this.playerAct(f, hits);
            else await this.enemyAct(f, hits);
            i = j;
            continue;
          }
          await this.applyFx(f);
          i++;
        }
        this.plates();
        await X.sleep(L.length ? 320 : 120);
      }
    },
    pos(who) {
      if (who === "hero") return [this.heroX + this.hero.ox, this.groundY - 34 + this.hero.oy];
      const h = this.foeImg.height;
      return [this.foeX + this.foe.ox, this.groundY - h * 0.45 + this.foe.oy];
    },
    async playerAct(act, hits) {
      const p = G.player;
      const look = S.lookOf(p.job);
      const kind = look.shield ? "sword" : look.weapon;
      const damaging = hits.some((h) => h.target === "enemy" && (h.kind === "hit" || h.kind === "crit"));
      const el = act.el || "phys";
      const ult = act.tag === "ult";
      const H = this.hero;
      if (act.action === "item") {
        H.anim = "cast"; H.f = 0;
        await X.sleep(180);
        for (const h of hits) await this.applyFx(h);
        H.anim = "idle";
        return;
      }
      if (ult) {
        const col = S.EL_COLOR[el] || C.lblue;
        this.dim = 0.55;
        X.magicCircle(this.heroX, this.groundY, col, 1500);
        H.anim = "cast"; H.f = 0;
        for (let k = 0; k < 14; k++) X.add({ x: this.heroX + (Math.random() - 0.5) * 60, y: this.groundY - Math.random() * 10, vy: -1 - Math.random(), life: 700, color: col, size: 1, glow: 0.8, shape: "star" });
        await X.sleep(600);
      }
      if (!damaging) {
        H.anim = "cast"; H.f = 0;
        await X.sleep(160);
        H.f = 1;
        for (const h of hits) await this.applyFx(h);
        await X.sleep(220);
        H.anim = "idle";
        this.dim = 0;
        return;
      }
      const from = [this.heroX - 22, this.groundY - 44];
      const to = this.pos("foe");
      const melee = !RANGED.has(kind) && !CASTER.has(kind) && (el === "phys" || act.action === "attack");
      if (melee && !ult) {
        H.anim = "windup";
        await tween(H, { ox: this.foeX - this.heroX + 62 }, 170);
        H.anim = "strike";
        const multi = act.type === "multi";
        const n = multi ? 3 : 1;
        for (let k = 0; k < n; k++) {
          if (el !== "phys") X.elementAttack(el, [to[0] + 30, to[1]], to, false);
          X.slash(to[0] + (Math.random() - 0.5) * 8, to[1] + (Math.random() - 0.5) * 10, S.EL_COLOR[el] || C.white, k === n - 1);
          if (k < n - 1) { this.foe.flash = 90; await X.sleep(110); H.anim = k % 2 ? "strike" : "follow"; }
        }
        await this.hitFx(hits);
        H.anim = "follow";
        await X.sleep(140);
        H.anim = "idle";
        await tween(H, { ox: 0 }, 190);
      } else {
        H.anim = RANGED.has(kind) ? "strike" : "cast";
        H.f = 0;
        await X.sleep(ult ? 80 : 160);
        H.f = 1;
        await X.elementAttack(el, from, to, ult, RANGED.has(kind));
        if (ult) { X.flash(S.EL_COLOR[el] || C.white, 220); this.quake = 300; }
        await this.hitFx(hits);
        await X.sleep(160);
        H.anim = "idle";
      }
      this.dim = 0;
    },
    async hitFx(hits) {
      for (const h of hits) await this.applyFx(h);
    },
    async enemyAct(act, hits) {
      const F2 = this.foe;
      const trait = act.trait || "attack";
      const target = this.pos("hero");
      await tween(F2, { ox: Math.min(80, this.heroX - this.foeX - 70) }, 150);
      const el = act.el && act.el !== "phys" ? act.el : null;
      if (trait === "drain") X.darkOrbs(target, this.pos("foe"), false);
      else if (trait === "stun") X.lightning(target[0], target[1] - 70, target[0], target[1], C.yellow, 240);
      else if (trait === "steal") X.coins(target[0], target[1]);
      else if (trait === "heavy") { X.claw(target[0], target[1], C.red); this.quake = 220; }
      else if (el && Math.random() < 0.5) X.elementAttack(el, this.pos("foe"), target, false);
      else X.claw(target[0], target[1], el ? S.EL_COLOR[el] : C.red);
      await X.sleep(90);
      for (const h of hits) await this.applyFx(h);
      await tween(F2, { ox: 0 }, 180);
    },
    async applyFx(f) {
      const H = this.hero;
      const Fo = this.foe;
      const hp = this.pos("hero");
      const fp = this.pos("foe");
      switch (f.kind) {
        case "hit": case "crit":
          if (f.target === "enemy") {
            if (f.src === "summon") { await X.projectile([this.heroX - 30, this.groundY - 60], fp, { color: C.cyan, size: 3, speed: 6, trail: 0.9, trailColors: [C.cyan, C.white], glowR: 10 }); }
            if (f.src === "counter") X.slash(fp[0], fp[1], C.white, false);
            Fo.flash = 120; Fo.shake = 200;
            X.pop(fp[0], fp[1] - 26, String(f.amount), f.kind === "crit" ? C.orange : C.white, f.kind === "crit");
            if (f.kind === "crit") X.pop(fp[0], fp[1] - 50, "CRITICAL!", C.yellow, false);
            if (f.weak) X.pop(fp[0] + 20, fp[1] - 14, "WEAK", C.cyan, false);
            if (f.kind === "crit") this.quake = 160;
          } else {
            H.flash = 120; H.shake = 220; H.anim = "hurt";
            X.pop(hp[0], hp[1] - 30, String(f.amount), C.red, f.amount > E.derive(G.player).maxHp * 0.25);
            await X.sleep(150);
            H.anim = "idle";
          }
          await X.sleep(90);
          break;
        case "miss":
          X.pop(hp[0], hp[1] - 34, "MISS", C.lgrey, false);
          await tween(H, { ox: 16 }, 90);
          await tween(H, { ox: 0 }, 120);
          break;
        case "dot":
          if (f.target === "enemy") { X.statusPuff(fp[0], fp[1], f.dot); Fo.flash = 80; X.pop(fp[0], fp[1] - 24, String(f.amount), f.dot === "poison" ? C.green : C.pink, false); }
          else { X.statusPuff(hp[0], hp[1], f.dot); H.flash = 80; X.pop(hp[0], hp[1] - 28, String(f.amount), C.pink, false); }
          await X.sleep(240);
          break;
        case "status":
          X.statusPuff(fp[0], fp[1], f.st);
          await X.sleep(160);
          break;
        case "heal":
          if (f.target === "enemy") { X.heal(fp[0], fp[1], C.green); X.pop(fp[0], fp[1] - 24, "+" + f.amount, C.green, false); }
          else { X.heal(hp[0], hp[1], f.src === "revive" ? C.orange : C.green); X.pop(hp[0], hp[1] - 30, "+" + f.amount, C.green, false); }
          await X.sleep(260);
          break;
        case "mana":
          X.heal(hp[0], hp[1], C.lblue); X.pop(hp[0], hp[1] - 30, "+" + f.amount, C.lblue, false);
          await X.sleep(200);
          break;
        case "shield":
          X.shield(hp[0], hp[1]); X.pop(hp[0], hp[1] - 30, "+" + f.amount, C.cyan, false);
          await X.sleep(220);
          break;
        case "buff":
          X.buff(hp[0], hp[1], f.summon ? C.cyan : S.EL_COLOR[f.el] || C.yellow);
          await X.sleep(220);
          break;
        case "gold":
          X.coins(fp[0], fp[1]); X.pop(fp[0], fp[1] - 30, "+" + f.amount, C.gold, false);
          await X.sleep(180);
          break;
        default:
          break;
      }
    },
    async victory() {
      const b = this.b;
      const p = G.player;
      const e = b.enemy;
      const fp = this.pos("foe");
      X.explosion(fp[0], fp[1], [C.white, C.yellow, S.EL_COLOR[e.el] || C.white], e.boss ? 2 : 1.2);
      await tween(this.foe, { alpha: 0 }, 380);
      this.foe.dead = true;
      const rw = b.reward;
      const lines = [`<b>${esc(J(e.name, "을/를"))}</b> 쓰러뜨렸다!`, `경험치 <b>+${fmt(rw.exp)}</b> · <b>${fmt(rw.gold)}G</b>`];
      rw.drops.forEach((d) => lines.push(esc(d)));
      if (rw.post) lines.push(`전투 후 회복 HP +${fmt(rw.post)}`);
      if (rw.levels.length) {
        lines.push(`<b class="lvup">레벨 업! Lv.${rw.levels[rw.levels.length - 1]}</b>`);
        X.ring(this.heroX, this.groundY, C.yellow, { r1: 50, life: 700 });
        X.sparkle(this.heroX, this.groundY - 40, C.yellow, 14);
        X.pop(this.heroX, this.groundY - 90, "LEVEL UP!", C.yellow, true);
        this.hero.anim = "victory";
      }
      if (rw.unlocked.length) lines.push(`새 기술: <b>${rw.unlocked.map(esc).join(", ")}</b>`);
      this.plates();
      const boss = e.boss;
      save();
      await X.sleep(500);
      closeAll();
      say([lines.slice(0, 2).join("<br>"), ...(lines.length > 2 ? [lines.slice(2).join("<br>")] : []), ...(boss ? ["보스가 쓰러지자 바닥에 아래로 내려가는 계단이 열렸다."] : [])], () => this.backToField(true));
    },
    backToField(won) {
      const ent = this.ent;
      fade(() => {
        const field = Field;
        G.scene = field;
        X.clear();
        if (won) {
          field.mons = field.mons.filter((m) => m !== ent);
          if (ent.boss) field.map.stairs = { x: ent.tx, y: ent.ty };
        } else {
          ent.ai = 1500;
          field.freezeT = 1200;
        }
        field.hud();
        save();
      });
    },
    async fled() {
      closeAll();
      say("무사히 도망쳤다!", () => this.backToField(false));
    },
    async defeat() {
      const p = G.player;
      const b = this.b;
      this.hero.anim = "hurt";
      await tween(this.hero, { ko: 1 }, 500);
      const bonus = Math.min(3, Math.floor(p.best / 10));
      G.tokens = Math.min(5, G.tokens + bonus);
      store.set("tokens", G.tokens);
      addHall(p, b.enemy.name);
      store.del("save");
      closeAll();
      openWin(`<h2 class="win-h over">쓰러졌다…</h2>
        <div class="over-body"><img src="${thumb(p.job, "down", 2)}" alt="">
        <p><b>${esc(p.name)}</b><br><span class="rar-t-${p.job.rarity}">${rarName(p.job.rarity)} ${esc(p.job.name)}</span> · Lv.${p.level}<br>최고 기록 지하 ${p.best}층 · 처치 ${fmt(p.kills)}<br>${esc(J(b.enemy.name, "에게"))} 패배</p></div>
        <p class="win-msg">${bonus ? `깊이 내려간 보답으로 다음 운명의 재굴림 기회 +${bonus}` : "10층을 넘길 때마다 다음 운명의 재굴림 기회가 늘어납니다."}</p>
        <div class="opts"><button class="opt primary" type="button" data-opt="new">새로운 운명</button><button class="opt" type="button" data-opt="hall">명예의 전당</button><button class="opt" type="button" data-opt="title">타이틀로</button></div>`, {
        cls: "win-center", noBack: true,
        onPick: (v) => {
          G.player = null;
          if (v === "new") { closeAll(); startRoll(null); }
          if (v === "hall") openHall();
          if (v === "title") { closeAll(); setScene(Title); }
        }
      });
    },
    key(k) {
      if (this.mode === "anim" && k === "a") G.fast = true;
    },
    update(dt) {
      if (this.quake) this.quake = Math.max(0, this.quake - dt);
      ["hero", "foe"].forEach((who) => {
        const a = this[who];
        a.flash = Math.max(0, a.flash - dt);
        a.shake = Math.max(0, a.shake - dt);
      });
      const p = G.player;
      if (p && p.job.rarity >= 3 && Math.random() < 0.06) {
        const col = S.RARITY_COLOR[p.job.rarity];
        X.add({ x: this.heroX + this.hero.ox + (Math.random() - 0.5) * 34, y: this.groundY - Math.random() * 6, vy: -0.5 - Math.random() * 0.5, life: 800, color: col, size: 1, glow: 0.7 });
      }
    },
    draw(t) {
      const sh = this.sceneH;
      const tier = this.tier;
      const qx = this.quake ? Math.round((Math.random() - 0.5) * 6) : 0;
      const qy = this.quake ? Math.round((Math.random() - 0.5) * 4) : 0;
      ctx.save();
      ctx.translate(qx, qy);
      ctx.fillStyle = Wd.DPAL[tier].top;
      ctx.fillRect(-8, -8, VW + 16, VH + 16);
      const wallY = this.groundY - 96;
      for (let x = -TS; x < VW + TS; x += TS) {
        for (let y = wallY - Math.ceil(wallY / TS) * TS; y < this.groundY - 30; y += TS) ctx.drawImage(Wd.groundTile({ kind: "dungeon", tier }, "wall" + ((x / TS + y) % 2 ? 1 : 0), 0), x, y);
        for (let y = this.groundY - 30; y < sh + TS; y += TS) ctx.drawImage(Wd.groundTile({ kind: "dungeon", tier }, "floor" + ((x / TS) % 3 === 1 ? 1 : 0), 0), x, y);
      }
      const torchF = Math.floor(t / 160) % 2;
      [[VW * 0.12, wallY + 30], [VW * 0.88, wallY + 30], [VW * 0.5, wallY + 22]].forEach(([x, y]) => {
        const img = Wd.torch(torchF);
        ctx.drawImage(img, Math.round(x - 7), Math.round(y));
        ctx.save(); ctx.globalCompositeOperation = "lighter"; X.glowDot(ctx, x, y + 8, 46, C.orange, 0.22); ctx.restore();
      });
      const vg = ctx.createLinearGradient(0, 0, 0, sh);
      vg.addColorStop(0, "rgba(5,3,12,0.75)");
      vg.addColorStop(0.45, "rgba(5,3,12,0.2)");
      vg.addColorStop(1, "rgba(5,3,12,0.55)");
      ctx.fillStyle = vg;
      ctx.fillRect(-8, -8, VW + 16, sh + 16);
      if (this.dim) { ctx.fillStyle = `rgba(4,2,14,${this.dim})`; ctx.fillRect(-8, -8, VW + 16, sh + 16); }
      // 적
      const Fo = this.foe;
      const img = this.foeImgName;
      const fx = this.foeX + Fo.ox + (Fo.shake ? Math.round(Math.sin(Fo.shake * 0.3) * 3) : 0);
      const bob = Fo.dead ? 0 : Math.round(Math.sin(t / 300) * 2);
      shadow(fx, this.groundY + 2, img.width * 0.32, 6, 0.45 * Fo.alpha);
      const ix = fx - img.width / 2;
      const iy = this.groundY + 4 - img.height + bob;
      drawSprite(img, ix, iy, Fo.alpha);
      if (Fo.flash > 0) drawSprite(S.silhouette(img, "#ffffff"), ix, iy, Math.min(1, Fo.flash / 60) * Fo.alpha);
      // 주인공
      const H = this.hero;
      const p = G.player;
      if (p) {
        const anim = H.anim;
        const fr = Dl.frame(p.job, "left", anim === "cast" ? "cast" : anim, anim === "idle" ? Math.floor(t / 450) % 2 : H.f || 0, 1.5);
        const hx = this.heroX + H.ox + (H.shake ? Math.round(Math.sin(H.shake * 0.35) * 3) : 0);
        shadow(hx, this.groundY + 2, 18, 5);
        const dx = hx - fr.ax;
        const dy = this.groundY + 6 - fr.ay + H.oy;
        ctx.save();
        if (H.ko) {
          ctx.translate(hx, this.groundY);
          ctx.rotate((-Math.PI / 2) * H.ko);
          ctx.globalAlpha = 1 - H.ko * 0.3;
          ctx.drawImage(fr.cv, -fr.ax, 6 - fr.ay);
        } else {
          ctx.drawImage(fr.cv, Math.round(dx), Math.round(dy));
          if (H.flash > 0) { ctx.globalAlpha = Math.min(1, H.flash / 60); ctx.drawImage(S.silhouette(fr.cv, "#ffffff"), Math.round(dx), Math.round(dy)); }
        }
        ctx.restore();
        if (!H.ko) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          fr.glow.forEach(([pt, col]) => X.glowDot(ctx, dx + pt[0], dy + pt[1], 12, col, 0.45 + 0.15 * Math.sin(t / 180)));
          ctx.restore();
        }
      }
      X.draw(ctx);
      X.drawPops(ctx);
      ctx.restore();
    }
  };

  /* ── 트윈 ── */
  const tweens = [];
  function tween(obj, to, ms) {
    return new Promise((res) => {
      const from = {};
      Object.keys(to).forEach((k) => { from[k] = obj[k]; });
      tweens.push({ obj, from, to, t: 0, ms: Math.max(1, ms), res });
    });
  }
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      Object.keys(tw.to).forEach((key) => { tw.obj[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e; });
      if (k >= 1) { tweens.splice(i, 1); tw.res(); }
    }
  }

  /* ── 이어하기 ── */
  function continueGame() {
    const saved = store.get("save", null);
    if (!saved) { Title.menu(); return; }
    G.player = unpackPlayer(saved.player);
    closeAll();
    fade(() => {
      if (saved.place === "dungeon") {
        setScene(Field, { kind: "dungeon", floor: Math.max(1, G.player.floor) });
        if (saved.pending) {
          const mon = E.monsterByName(saved.pending.name);
          if (mon) {
            const ent = makeEnt(Field.hero.tx, Field.hero.ty, { mon, boss: mon.boss, ms: 230, ai: 900 });
            setTimeout(() => startBattle(ent), 300);
            return;
          }
        }
        banner(`지하 ${G.player.floor}층`);
      } else setScene(Field, { kind: "town" });
    });
  }

  /* ── 루프 ── */
  let last = 0;
  function frame(now) {
    const raw = Math.min(50, now - (last || now));
    last = now;
    const dt = raw * (G.fast ? 3 : 1);
    G.t += raw;
    X.tick(dt);
    X.update(dt);
    X.updatePops(dt);
    updateTweens(dt);
    if (G.scene) {
      G.scene.update(dt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      G.scene.draw(G.t);
    }
    root.requestAnimationFrame(frame);
  }

  function snapshot() {
    return { player: G.player ? packPlayer(G.player) : null, place: G.place };
  }

  function start(data) {
    G.tokens = store.get("tokens", 0);
    G.codex = new Set(store.get("codex", []));
    G.hall = store.get("hall", []);
    resize();
    bindPad();
    root.addEventListener("resize", () => {
      resize();
      if (G.scene === Battle) { Battle.layout(); }
    });
    $("cv").addEventListener("pointerdown", () => { if (G.scene === Battle && Battle.mode === "anim") G.fast = true; });
    if (data && data.player) {
      G.player = unpackPlayer(data.player);
      setScene(Field, { kind: "town" });
    } else setScene(Title);
    root.requestAnimationFrame(frame);
  }

  F.game = { G, Field, Battle, Title, Roll, setScene, openCodex, openHall };

  const hot = root.claude && root.claude.hot;
  if (hot && typeof hot.snapshot === "function") hot.snapshot(snapshot);
  if (hot && typeof hot.ready === "function") hot.ready(start);
  else if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => start((hot && hot.data) || {}));
  else start((hot && hot.data) || {});
})(window);
